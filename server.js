const { execSync } = require('child_process');
const fs = require('fs');

// 配置信息（可根据需要修改）
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
  // 1. 检测服务器架构
  let arch = execSync('uname -m | tr \'[:upper:]\' \'[:lower:]\'').toString().trim();
  if (arch.includes('arm64') || arch.includes('aarch64')) arch = 'arm64';
  else if (arch.includes('x86_64') || arch.includes('amd64')) arch = 'amd64';
  else throw new Error(`不支持的架构: ${arch}`);
  const binName = `hysteria-linux-${arch}`;

  // 2. 清理旧文件并下载Hy2二进制
  execSync(`rm -f ${binName}`);
  const url = `https://github.com/apernet/hysteria/releases/download/${config.version}/${binName}`;
  execSync(`curl -L --retry 5 -o ${binName} ${url}`);
  
  // 验证文件大小（至少5MB）
  const fileSize = fs.statSync(binName).size;
  if (fileSize < 5 * 1024 * 1024) throw new Error("下载文件异常");
  execSync(`chmod +x ${binName}`);

  // 3. 生成自签证书（若不存在）
  if (!fs.existsSync(config.certFile) || !fs.existsSync(config.keyFile)) {
    execSync(`openssl req -x509 -nodes -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -days 3650 -keyout ${config.keyFile} -out ${config.certFile} -subj "/CN=${config.sni}"`);
  }

  // 4. 生成配置文件server.yaml
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

  // 5. 获取服务器IP并输出节点信息
  const serverIp = execSync('curl -s --max-time 10 https://api.ipify.org || echo "未知IP"').toString().trim();
  const appDomain = process.env.SCALINGO_APP_URL || serverIp; // Scalingo分配的域名
  console.log("\n🎉 部署成功！节点信息：");
  console.log(`IP/域名：${appDomain}`);
  console.log(`端口：${config.port}`);
  console.log(`密码：${config.password}`);
  console.log(`节点链接：hysteria2://${config.password}@${appDomain}:${config.port}?sni=${config.sni}&alpn=${config.alpn}&insecure=true#Hy2-Scalingo`);

  // 6. 启动Hy2服务（前台运行，保持进程）
  execSync(`./${binName} server -c server.yaml`, { stdio: 'inherit' });

} catch (err) {
  console.error(`❌ 错误：${err.message}`);
  process.exit(1);
}
