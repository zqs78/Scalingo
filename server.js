const { execSync } = require('child_process');
const fs = require('fs');

// 配置信息（保持与之前一致，无需改动）
const config = {
  version: "v2.6.4",
  port: 25031,
  password: "20250930",
  sni: "www.bing.com",
  alpn: "h3",
  certFile: "cert.pem",
  keyFile: "key.pem"
};

try {
  // 1. 强制指定架构为 amd64（适配 Scalingo 容器）
  const arch = "amd64";
  const binName = `hysteria-linux-${arch}`;

  // 2. 清理旧文件并下载 Hy2 二进制
  execSync(`rm -f ${binName}`);
  const url = `https://github.com/apernet/hysteria/releases/download/${config.version}/${binName}`;
  console.log(`下载 Hy2 服务端: ${url}`);
  execSync(`curl -L --retry 5 --connect-timeout 30 -o ${binName} ${url}`);
  
  // 验证文件大小（至少 5MB）
  const fileSize = fs.statSync(binName).size;
  if (fileSize < 5 * 1024 * 1024) throw new Error("Hy2 二进制文件下载不完整");
  execSync(`chmod +x ${binName}`);
  console.log("Hy2 服务端准备完成");

  // 3. 生成自签证书（依赖 openssl，已通过 apt 安装）
  if (!fs.existsSync(config.certFile) || !fs.existsSync(config.keyFile)) {
    console.log("生成 TLS 证书...");
    execSync(`openssl req -x509 -nodes -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -days 3650 -keyout ${config.keyFile} -out ${config.certFile} -subj "/CN=${config.sni}"`);
    console.log("证书生成成功");
  } else {
    console.log("证书已存在，跳过生成");
  }

  // 4. 生成配置文件 server.yaml
  const yamlContent = `listen: ":${config.port}"
tls:
  cert: "${process.cwd()}/${config.certFile}"
  key: "${process.cwd()}/${config.keyFile}"
  alpn:
    - "${config.alpn}"
auth:
  type: "password"
  password: "${config.password}"
bandwidth:
  up: "200mbps"
  down: "200mbps"
quic:
  max_idle_timeout: "10s"
  max_concurrent_streams: 4
  initial_stream_receive_window: 65536
  max_stream_receive_window: 131072
  initial_conn_receive_window: 131072
  max_conn_receive_window: 262144`;
  fs.writeFileSync('server.yaml', yamlContent);
  console.log("配置文件生成成功");

  // 5. 获取服务器域名（Scalingo 分配的地址）
  const appDomain = process.env.SCALINGO_APP_URL ? process.env.SCALINGO_APP_URL.replace('https://', '') : execSync('curl -s --max-time 10 https://api.ipify.org').toString().trim();
  console.log("\n🎉 部署成功！节点信息：");
  console.log(`域名/IP：${appDomain}`);
  console.log(`端口：${config.port}`);
  console.log(`密码：${config.password}`);
  console.log(`节点链接：hysteria2://${config.password}@${appDomain}:${config.port}?sni=${config.sni}&alpn=${config.alpn}&insecure=true#Hy2-Scalingo`);

  // 6. 启动 Hy2 服务（前台运行）
  console.log("\n启动 Hy2 服务...");
  execSync(`./${binName} server -c server.yaml`, { stdio: 'inherit' });

} catch (err) {
  console.error(`\n❌ 错误：${err.message}`);
  process.exit(1);
}
