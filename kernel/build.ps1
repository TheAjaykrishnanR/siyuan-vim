# goversioninfo -platform-specific=true -icon="resource/icon.ico" -manifest="resource/goversioninfo.exe.manifest"
goversioninfo -platform-specific=true -icon="resource/icon.ico"
go build -tags "fts5 sqlcipher" -o "../app/kernel/SiYuan-Kernel.exe"
