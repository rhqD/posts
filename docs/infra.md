# 基础设施（ROS）

## 现状

CDN、OSS、DNS 目前是控制台手工建的，代码里没有可复现的定义。
目标是把能声明的东西收进 ROS，让「这个站的完整形态」有一份文件可查。

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

家庭项目建议 1：先把便宜占到，等真需要重建时再补模板。

## 导入已有资源的现实

ROS 不是 Terraform，没有 `data` 源。把已有 bucket / CDN 域名纳管只能走「资源导入」，
且不是所有资源类型都支持。

渐进路径：

1. 先写模板描述**目标状态**，用 `PreviewStack` 验证（不动线上）
2. 新建资源（安全组、EIP、DNS 记录）直接走 ROS
3. 存量（OSS bucket、CDN 域名）确认支持导入后再接管

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
    site.yml          # 主栈：bucket + CDN + DNS
    control.yml       # 控制面：安全组 + EIP + ECS
    params-prod.json
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
