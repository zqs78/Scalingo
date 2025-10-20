const express = require('express');
const app = express();
const port = process.env.PORT || 3000; // 兼容 Scalingo 的动态端口

// 测试路由（后续可根据 hy2 需求扩展）
app.get('/', (req, res) => {
  res.send('Hy2 Node Server is Running!');
});

// 启动服务
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});