# build script for creating executables

$root = $pwd.Path

# build the kernel
cd kernel
go build -tags "fts5 sqlcipher" -o "../app/kernel/SiYuan-Kernel.exe" -v -ldflags "-s -w -H=windowsgui -X github.com/siyuan-note/siyuan/kernel/util.Mode=prod"

# build the ui and pack electron
cd $root\app
pnpm install --no-frozen-lockfile
pnpm run build
pnpm run dist # electron
