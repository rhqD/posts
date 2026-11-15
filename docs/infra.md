# 基础设施（ROS）

## 现状

| 资源 | 归属 |
| --- | --- |
| ECS `i-2zei3tvz1fhlkbfab0i6` | **ROS 资源栈 `renhanquan-control`**（导入接管） |
| OSS bucket / CDN 域名 / DNS 记录 | 仍是控制台手工建的，未纳管 |

控制面那条栈已经落地，模板在 `infra/ros/control.yml`；状态在阿里云侧，
`IMPORT_CREATE_COMPLETE`，漂移检测 `IN_SYNC`。

**接管的是「已经买好的那台」，不是 ROS 创建的。** 原因见下面「活动价实例」。
运维细节见 [control-plane.md](control-plane.md)。

静态站那条线（bucket / CDN / DNS）仍没有模板——它们变更频率极低，
真要重建时再按下面「导入已有资源」补。

## 分层：哪些进 ROS，哪些不进

| 层 | 内容 | 进 ROS | 理由 |
| --- | --- | --- | --- |
| 计算/网络 | ECS、安全组、EIP、VPC | 是 | 声明式，适合 |
| 存储 | OSS Bucket、ACL、静态托管、CORS | 是（只到配置） | 文件内容仍由 deploy.sh 管 |
| CDN | 域名、证书绑定 | 部分 | 缓存规则、HTTP/2 分散在多个 API，模板表达力不足 |
| 证书 | `*.renhanquan.com` | **否** | acme.sh 每 60 天自动续期，是运行时行为，不是状态 |
| 应用 | 二进制、systemd | 否 | 部署脚本更直接 |

**证书永远不进 ROS。** 它每天都会变，硬塞进模板只会制造冲突。

## 一个必须知道的坑：活动价实例

`99 元/年` 的 e 实例是**控制台活动价**。用 ROS 创建走标准价，拿不到活动折扣。

所以 ECS 只有两种正确姿势：

1. **手动买**，ROS 管它周边（安全组、EIP、快照策略、DNS），实例本身用「资源导入」接管
2. **ROS 创建**，接受标准价，换来完整可复现

本项目走的 **1**：控制台买机器，再导入 ROS 接管。

## 导入已有资源：实际用到的流程

ROS 不是 Terraform，没有 `data` 源。接管已有资源走**更改集导入**，
不是 `CreateStack --CreateOption Import`（当前 API 的 `CreateOption` 枚举里没有 Import）。

```bash
# 1) 建 IMPORT 更改集：ResourcesToImport 把逻辑 ID 绑到物理 ID
aliyun ros CreateChangeSet --RegionId cn-beijing \
  --StackName renhanquan-control --ChangeSetType IMPORT --ChangeSetName import-takeover \
  --TemplateBody "$(cat infra/ros/control.yml)" \
  --Parameters.1.ParameterKey InstanceId --Parameters.1.ParameterValue i-2zei3tvz1fhlkbfab0i6 \
  --ResourcesToImport.1.LogicalResourceId ControlInstance \
  --ResourcesToImport.1.ResourceType ALIYUN::ECS::Instance \
  --ResourcesToImport.1.ResourceIdentifier '{"InstanceId":"i-2zei3tvz1fhlkbfab0i6"}'

# 2) 先看：应该只有一条 Import，Replacement 为 None
aliyun ros GetChangeSet --RegionId cn-beijing --ChangeSetId <id>

# 3) 执行
aliyun ros ExecuteChangeSet --RegionId cn-beijing --ChangeSetId <id>
```

**模板里的默认值必须等于实例的真实值。** ROS 把模板当期望状态，属性一旦不符，
第一次 `UpdateStack` 就会去「纠正」——镜像是不可变属性，纠正就是替换实例。
本项目是用 `DescribeInstances` 把真实值 dump 出来再生成模板的。

导入后这样确认：

```bash
aliyun ros ListStackResources --RegionId cn-beijing --StackId <id>   # 实例已纳入
aliyun ros DetectStackDrift  --RegionId cn-beijing --StackId <id>   # IN_SYNC
```

判断「模板与真实是否一致」有个便宜办法：用同一份模板建一个 UPDATE 更改集。
如果 ROS 报 `Update the completely same stack ... is not supported`，
说明零差异——这正是想要的结果。

**别一次性全搬。** 半接管的状态最难排查。

## 安全红线

持有数据的资源必须显式声明：

```yaml
DeletionPolicy: Retain
UpdateReplacePolicy: Retain
```

OSS bucket 和 CDN 域名少了这两行，一次 `DeleteStack` 就能把站点和一千多个对象一起带走。

## 目录与命令

```
infra/
  ros/
    control.yml       # 控制面：接管 ECS（已落地）
    site.yml          # 静态站：bucket + CDN + DNS（尚未编写）
```

```bash
aliyun ros PreviewStack  --StackName renhanquan-site --TemplateBody file://infra/ros/site.yml
aliyun ros CreateStack   --StackName renhanquan-site --TemplateBody file://infra/ros/site.yml
aliyun ros UpdateStack   --StackName renhanquan-site --TemplateBody file://infra/ros/site.yml
aliyun ros ListResources --StackName renhanquan-site
```

ROS 的状态在阿里云侧，不需要本地 tfstate，多机操作不会打架。

## 与现有脚本的关系

| 动作 | 工具 |
| --- | --- |
| 建 bucket / CDN 域名 / 安全组 | ROS |
| 上传站点文件、设缓存头 | scripts/deploy.sh |
| 续期证书并绑定 | acme.sh hook |
| 清理孤儿对象 | scripts/prune-oss.mjs |

边界一句话：**ROS 管「有哪些资源」，脚本管「资源里面装什么」。**
