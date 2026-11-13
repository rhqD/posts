# 部署与运维

## 基础设施现状

| 项 | 值 |
| --- | --- |
| OSS bucket | `oss://renhanquan-site`（cn-hangzhou，public-read） |
| CDN 加速域名 | `www.renhanquan.com` |
| CDN CNAME 目标 | `www.renhanquan.com.w.kunlunaq.com` |
| DNS | 阿里云云解析 `ns1.alidns.com` / `ns2.alidns.com` |
| 证书 | Let's Encrypt 通配符 `*.renhanquan.com`，acme.sh 管理 |
| 证书文件 | `~/certs/renhanquan/{fullchain.pem,key.pem}` |
| 根域 | `renhanquan.com` A → 216.198.79.193（Vercel 307 到 www） |

## 日常发布

```bash
make publish        # sync + images + build + deploy
```

只想改代码不动内容：

```bash
make deploy         # build + upload
```

`make deploy` 的行为：

1. `pnpm build` 产出 `out/`
2. 自检 `out/index.html`、`out/404.html`
3. 先传 `_next/static` 和媒体（immutable），再传 html/txt/xml（no-cache）
4. 全程 `--update`，**从不删除远端文件**

## 3D 资产（/home）

模型和灯具配置不走 Notion，单独同步：

```bash
make sync-yard
```

它会从 `../yabai_home` 解析灯具配置写到 `public/yard/lights.json`，按内容哈希把
模型传成 `models/yard-web.<hash>.glb`（附精简 report），并把当前 hash 写回
`lights.json` 的 `model` 字段。

`yard/lights.json` 是**唯一允许的“指针文件”**，部署时必须 `no-cache`；模型本身
可以永久 immutable。换模型不需要刷 CDN。

旧 hash 的模型可以留在 OSS 上（页面永不引用），无需清理；缓存策略见上。

## 依赖的本地凭证

| 凭证 | 位置 | 检查命令 |
| --- | --- | --- |
| `NOTION_API_KEY` | `.env.local` | `make sync` 是否报错 |
| 阿里云 AK | `~/.ossutilconfig` | `ossutil ls` |
| 阿里云 AK（CLI） | `~/.aliyun/config.json` | `aliyun sts GetCallerIdentity` |

RAM 用户 `blogs_manager` 需要：`AliyunOSSFullAccess`、`AliyunCDNFullAccess`、`AliyunDNSFullAccess`。

## 从零重建（灾难恢复）

```bash
# 1. 建 bucket
ossutil mb oss://renhanquan-site
ossutil api put-bucket-public-access-block --bucket renhanquan-site \
  --public-access-block-configuration '{"BlockPublicAccess":false}'
ossutil api put-bucket-acl --bucket renhanquan-site --acl public-read

# 2. 开静态网站托管（SupportSubDir 必开）
ossutil api put-bucket-website --bucket renhanquan-site \
  --website-configuration '{"IndexDocument":{"Suffix":"index.html","SupportSubDir":true,"Type":0},"ErrorDocument":{"Key":"404.html"}}'

# 3. 建 CDN 域名（源站 OSS）
aliyun cdn AddCdnDomain --DomainName www.renhanquan.com --CdnType web --Scope domestic \
  --Sources '[{"type":"oss","content":"renhanquan-site.oss-cn-hangzhou.aliyuncs.com","port":80,"priority":20}]'

# 4. 缓存规则（注意默认的 / 规则要改成 0）
aliyun cdn BatchSetCdnDomainConfig --DomainNames "www.renhanquan.com" \
  --Functions '[{"functionArgs":[{"argName":"path","argValue":"/_next/static/"},{"argName":"ttl","argValue":"31536000"},{"argName":"weight","argValue":"90"}],"functionName":"path_based_ttl_set"}]'
aliyun cdn BatchSetCdnDomainConfig --DomainNames "www.renhanquan.com" \
  --Functions '[{"functionArgs":[{"argName":"file_type","argValue":"jpg,jpeg,png,webp,gif,svg,ico,mp3,woff,woff2,glb,gltf,bin,ktx2"},{"argName":"ttl","argValue":"31536000"},{"argName":"weight","argValue":"80"}],"functionName":"filetype_based_ttl_set"}]'
aliyun cdn BatchSetCdnDomainConfig --DomainNames "www.renhanquan.com" \
  --Functions '[{"functionArgs":[{"argName":"path","argValue":"/"},{"argName":"ttl","argValue":"0"},{"argName":"weight","argValue":"10"}],"functionName":"path_based_ttl_set"}]'

# 5. 证书
~/.acme.sh/acme.sh --issue --dns dns_ali -d renhanquan.com -d "*.renhanquan.com" --keylength ec-256 --server letsencrypt
aliyun cdn SetCdnDomainSSLCertificate --DomainName www.renhanquan.com \
  --SSLProtocol on --CertType upload \
  --SSLPub "$(cat ~/certs/renhanquan/fullchain.pem)" \
  --SSLPri "$(cat ~/certs/renhanquan/key.pem)"
aliyun cdn BatchSetCdnDomainConfig --DomainNames "www.renhanquan.com" \
  --Functions '[{"functionArgs":[{"argName":"enable","argValue":"on"}],"functionName":"https_force"}]'

# 6. HTTP/2（默认不开，不加这段所有资源都走 HTTP/1.1）
aliyun cdn BatchSetCdnDomainConfig --DomainNames "www.renhanquan.com" \
  --Functions '[{"functionArgs":[{"argName":"http2","argValue":"on"}],"functionName":"https_option"}]'
```

## 验收清单

```bash
curl -sI https://www.renhanquan.com/ | grep -i cache-control      # no-cache
curl -sI https://www.renhanquan.com/_next/static/...js | grep -i cache-control  # immutable
curl -sI --http2 https://www.renhanquan.com/ | head -1                # HTTP/2 200
curl -sI https://www.renhanquan.com/models/yard-web.glb | grep -iE 'cache-control|age'  # immutable + Age
curl -s  https://www.renhanquan.com/posts/ | grep -c "/posts/"   # 文章数
curl -sI https://www.renhanquan.com/nope | head -1               # 404
curl -sI http://www.renhanquan.com/ | head -1                    # 301 到 https
```

## 回滚

静态站没有“服务版本”概念，回滚 = 用上一个 commit 重新部署：

```bash
git checkout <old-commit>
make deploy
```

旧 hash 资源从不删除，所以回滚后浏览器缓存也不会错乱。

## 证书续期

acme.sh 已装 cron（每天 4 次检查，到期前 30 天续），续期后执行
`~/certs/renhanquan/deploy.sh`，它会把新证书上传到 CDN。

手动检查：

```bash
~/.acme.sh/acme.sh --list
echo | openssl s_client -connect www.renhanquan.com:443 -servername www.renhanquan.com 2>/dev/null | openssl x509 -noout -dates
```

> 以后 ECS 上的 api 子域也要装同一张证书，续期脚本里要加上分发那一半，否则 90 天后 api 先过期。

## 排障

| 现象 | 排查 |
| --- | --- |
| 页面 404 | 访问的是 `/posts` 还是 `/posts/`？后者才是产物；检查 OSS `SupportSubDir` |
| 图片裂 | `make images` 是否报 fetch failed；HTML 里是否残留 http 开头的图片地址 |
| 改了内容但线上没变 | CDN 缓存规则是否被控制台改回 30 天；`curl -sI` 看 `X-Cache`/`Age` |
| 502/403 | bucket 是否被改成私有；CDN 源站是否指向正确 bucket |
| 证书报错 | `openssl s_client` 看 CN 与有效期；acme.sh 是否续期成功 |