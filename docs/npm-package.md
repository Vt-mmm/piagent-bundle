# Gói npm `@piagent/pi-bundle`

Bộ Pi (Pi 1.3.0 riêng + harness + sandbox + provider ở commit ghim) đóng thành **một package npm toàn cục**, cài giống `@piagent/platform`. Agent Watch **không cài** nó: chỉ tìm ở mọi prefix npm và ghim đường dẫn + hash vào binding.

## Cấu trúc sau khi cài
```
<npm prefix>/lib/node_modules/@piagent/pi-bundle/
  bundle/manifest.json            sha256 từng phần (hash v2) + commit từng package
  bundle/pi/ (node_modules, bin/pi, packages/piagent-{harness,sandbox,provider})
  bin/piagent-pi-bundle.mjs       lệnh piagent-pi-bundle
  src/                            doctor + manifest (dùng cho lệnh doctor)
<npm prefix>/bin/piagent-pi-bundle
```
Gốc bộ mà Agent Watch mở: `<prefix>/lib/node_modules/@piagent/pi-bundle/bundle`.

## Lệnh của member (một lệnh)
```bash
npm install --global @piagent/pi-bundle      # cài
piagent-pi-bundle update                      # = npm install --global @piagent/pi-bundle@latest
piagent-pi-bundle repair                      # cài lại đúng bản đang có (--force)
piagent-pi-bundle doctor [--expect <sha256>]  # ok:true khi mọi phần khớp hash; in cả sha256 của manifest.json
piagent-pi-bundle path                        # in thư mục bộ
```
`install/update/repair` nhận `--prefix <dir>` và `--dry-run` (chỉ in lệnh npm). Cần Node >= 22.19 (member có sẵn vì cài Piagent qua npm).

## Vì sao không có `dependencies` / lockfile ở package gốc
npm bỏ qua lockfile khi cài toàn cục, nên dependency tính lúc cài không ghim được. Thay vào đó cây `pi/node_modules` được dựng từ `pi-lock/package-lock.json` (`npm ci --ignore-scripts`) lúc **build**, nằm sẵn trong tarball, và `manifest.json` ghim sha256 của từng phần. Cài không chạy script nào; sai một byte là `doctor` báo `hash-mismatch`.

Để hash cài xong khớp hash lúc build, bước build (`makePortable`) bỏ các symlink `node_modules/.bin`, các file `.npmignore/.gitignore/.npmrc/.DS_Store` (npm pack không giữ) và chuẩn hoá quyền 755/644, rồi mới tính manifest.

## Build tarball (không publish)
```bash
node scripts/build-npm-package.mjs --out <thư mục trống> --bundle-version 0.1.1 \
  [--source provider=<clone>] [--source sandbox=<clone>] [--source harness=<clone>]
npm i -g <out>/piagent-pi-bundle-0.1.1.tgz --prefix <tmp> --ignore-scripts
<tmp>/bin/piagent-pi-bundle doctor        # phải ok:true
```

## Publish (owner, chưa làm)
Workflow `.github/workflows/publish-npm.yml`, giống `piagent`: chạy khi push tag `v*.*.*`, hoặc `workflow_dispatch` với `dry_run: true` (mặc định). Tag phải trùng `package.json`; bản có hậu tố `-` đi dist-tag `next`. Provenance bật (`id-token: write`, `npm publish --provenance`), cần secret `NPM_TOKEN`. Trước tag: ghim `bundle.pins.json` vào commit đã merge của ba package (không ghim commit chỉ có trên máy), chạy `npm run test:e2e`. Gỡ bản đã publish không phải rollback: rollback là `npm install --global @piagent/pi-bundle@<bản cũ>`.

## Rollback
`npm install --global @piagent/pi-bundle@<bản trước>`; hoặc gạt `runtime = piagent` trong Studio (không cần cài gì).
