export default {
  async fetch(request, env, ctx) {
    // 核心配置
    const CONFIG = {
      R2_BUCKET_NAME: 'yhdisk11111', // 替换为你的R2 Bucket名称
      SECRET_KEY: 'yo2ur-strong2-secrets-key-her2e', // 随便你写
      DOWNLOAD_CODE_EXPIRE: 3600,
      ALLOWED_ORIGINS: ['*'],
      ROOT_PATH: '',
      SHOW_HIDDEN_FILES: false,
      PAGE_TITLE: 'oo不oo的R2 文件管理器',
      // 支持预览的图片格式
      IMAGE_EXTENSIONS: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'],
    };

    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const targetPath = CONFIG.ROOT_PATH + (path || '');

    // 跨域处理
    if (request.method === 'OPTIONS') {
      return handleCors(CONFIG.ALLOWED_ORIGINS);
    }

    // 接口路由
    if (url.searchParams.has('generate-code')) {
      const fileName = url.searchParams.get('generate-code');
      return generateDownloadCode(fileName, env, CONFIG, url);
    }
    if (url.searchParams.has('code')) {
      const code = url.searchParams.get('code');
      return downloadFileByCode(code, env, CONFIG);
    }
    if (url.searchParams.has('download')) {
      const fileName = url.searchParams.get('download');
      return downloadFileDirectly(fileName, env, CONFIG);
    }
    if (url.searchParams.has('preview')) {
      const fileName = url.searchParams.get('preview');
      return previewImage(fileName, env, CONFIG);
    }

    // 渲染主页面
    return renderFileManager(targetPath, env, CONFIG, url);
  },
};

// 跨域处理
function handleCors(allowedOrigins) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': allowedOrigins.join(','),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// 格式化时间
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// 生成面包屑导航
function generateBreadcrumbs(currentPath, baseUrl) {
  const parts = currentPath.split('/').filter(Boolean);
  let breadcrumbs = [{ name: '根目录', path: baseUrl }];
  let currentPathStr = '';

  parts.forEach((part) => {
    currentPathStr += part + '/';
    breadcrumbs.push({
      name: part,
      path: `${baseUrl}${encodeURIComponent(currentPathStr)}`,
    });
  });

  return breadcrumbs.map(crumb => 
    `<a href="${crumb.path}" class="breadcrumb-item">${crumb.name}</a>`
  ).join(' / ');
}

// 图片预览接口
async function previewImage(fileKey, env, config) {
  const bucket = env[config.R2_BUCKET_NAME];
  const object = await bucket.get(fileKey);

  if (!object) {
    return new Response('图片不存在', { status: 404 });
  }

  const ext = fileKey.split('.').pop().toLowerCase();
  if (!config.IMAGE_EXTENSIONS.includes(ext)) {
    return new Response('不支持的图片格式', { status: 400 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', `image/${ext === 'jpg' ? 'jpeg' : ext}`);
  headers.set('Access-Control-Allow-Origin', config.ALLOWED_ORIGINS.join(','));
  // 移除下载头，让浏览器直接显示图片而非下载
  headers.delete('Content-Disposition');

  return new Response(object.body, { status: 200, headers });
}

// 渲染文件管理器页面
async function renderFileManager(targetPath, env, config, url) {
  const bucket = env[config.R2_BUCKET_NAME];
  const baseUrl = `${url.origin}/`;
  const cleanPath = targetPath.replace(/\/+/g, '/').replace(/\.\./g, '');
  
  const listOptions = {
    prefix: cleanPath,
    delimiter: '/',
    include: ['httpMetadata', 'customMetadata'],
  };

  try {
    const objects = await bucket.list(listOptions);
    const directories = new Set();
    const files = [];

    // 处理文件夹
    objects.delimitedPrefixes.forEach(prefix => {
      const dirName = prefix.replace(cleanPath, '').replace(/\/$/, '');
      if (dirName && (config.SHOW_HIDDEN_FILES || !dirName.startsWith('.'))) {
        directories.add(dirName);
      }
    });

    // 处理文件
    for (const obj of objects.objects) {
      const fileName = obj.key.replace(cleanPath, '');
      if (!fileName || (!config.SHOW_HIDDEN_FILES && fileName.startsWith('.'))) {
        continue;
      }

      const ext = fileName.split('.').pop().toLowerCase();
      const isImage = config.IMAGE_EXTENSIONS.includes(ext);
      
      files.push({
        name: fileName,
        sizeFormatted: formatFileSize(obj.size),
        modifiedFormatted: formatTime(obj.uploaded),
        path: obj.key,
        downloadUrl: `${baseUrl}?download=${encodeURIComponent(obj.key)}`,
        previewUrl: isImage ? `${baseUrl}?preview=${encodeURIComponent(obj.key)}` : '',
        codeUrl: `${baseUrl}?generate-code=${encodeURIComponent(obj.key)}`,
        isImage,
      });
    }

    // 生成HTML
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.PAGE_TITLE} - ${cleanPath || '根目录'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #f8f9fa; color: #333; line-height: 1.6; padding: 20px; max-width: 1200px; margin: 0 auto; }
    .header { margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #dee2e6; }
    .title { font-size: 24px; font-weight: 600; color: #212529; margin-bottom: 10px; }
    .breadcrumbs { font-size: 14px; color: #6c757d; }
    .breadcrumb-item { color: #0d6efd; text-decoration: none; }
    .breadcrumb-item:hover { text-decoration: underline; }
    .file-list { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
    .list-header { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; padding: 12px 15px; background: #e9ecef; font-weight: 600; border-bottom: 1px solid #dee2e6; }
    .list-item { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; padding: 12px 15px; border-bottom: 1px solid #f1f3f5; transition: background 0.2s; }
    .list-item:last-child { border-bottom: none; }
    .list-item:hover { background: #f8f9fa; }
    .list-item.dir .name { color: #0d6efd; font-weight: 500; }
    .name { display: flex; align-items: center; gap: 8px; }
    .icon { font-size: 18px; }
    .size, .modified { color: #6c757d; font-size: 14px; }
    .actions { display: flex; gap: 10px; justify-content: center; }
    .btn { padding: 4px 8px; border-radius: 4px; text-decoration: none; font-size: 13px; transition: all 0.2s; }
    .btn-download { background: #0d6efd; color: white; border: 1px solid #0d6efd; }
    .btn-download:hover { background: #0b5ed7; border-color: #0a58ca; }
    .btn-code { background: #198754; color: white; border: 1px solid #198754; }
    .btn-code:hover { background: #157347; border-color: #146c43; }
    .empty { padding: 40px; text-align: center; color: #6c757d; }
    .code-modal { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); justify-content: center; align-items: center; z-index: 1000; }
    .modal-content { background: white; padding: 20px; border-radius: 8px; width: 90%; max-width: 500px; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    .modal-title { font-size: 18px; font-weight: 600; }
    .close-modal { cursor: pointer; font-size: 20px; color: #6c757d; background: none; border: none; }
    .code-info { margin: 10px 0; }
    .code-label { font-size: 14px; color: #6c757d; margin-bottom: 5px; }
    .code-value { padding: 10px; background: #f8f9fa; border-radius: 4px; font-family: monospace; word-break: break-all; }
    .copy-btn { margin-top: 10px; padding: 6px 12px; background: #0d6efd; color: white; border: none; border-radius: 4px; cursor: pointer; }
    .file-name-link { color: #0d6efd; text-decoration: none; }
    .file-name-link:hover { text-decoration: underline; }
    @media (max-width: 768px) {
      .list-header { grid-template-columns: 2fr 1fr 1fr; }
      .list-item { grid-template-columns: 2fr 1fr 1fr; }
      .actions { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">${config.PAGE_TITLE}</h1>
    <div class="breadcrumbs">${generateBreadcrumbs(cleanPath, baseUrl)}</div>
  </div>

  <div class="file-list">
    <div class="list-header">
      <div class="name">名称</div>
      <div class="size">大小</div>
      <div class="modified">修改时间</div>
      <div class="actions">操作</div>
    </div>

    ${Array.from(directories).map(dir => `
      <div class="list-item dir">
        <div class="name">
          <span class="icon">📁</span>
          <a href="${baseUrl}${encodeURIComponent(cleanPath + dir + '/')}" style="color: inherit; text-decoration: none;">${dir}</a>
        </div>
        <div class="size">-</div>
        <div class="modified">-</div>
        <div class="actions"></div>
      </div>
    `).join('')}

    ${files.map(file => `
      <div class="list-item file">
        <div class="name">
          <span class="icon">${file.isImage ? '🖼️' : '📄'}</span>
          ${file.isImage ? 
            `<a href="${file.previewUrl}" target="_blank" rel="noopener noreferrer" class="file-name-link">${file.name}</a>` : 
            `<a href="${file.downloadUrl}" class="file-name-link">${file.name}</a>`
          }
        </div>
        <div class="size">${file.sizeFormatted}</div>
        <div class="modified">${file.modifiedFormatted}</div>
        <div class="actions">
          <a href="${file.downloadUrl}" class="btn btn-download">下载</a>
          <a href="javascript:void(0)" class="btn btn-code" onclick="showCodeModal('${file.codeUrl}', '${file.name}')">下载码</a>
        </div>
      </div>
    `).join('')}

    ${(directories.size === 0 && files.length === 0) ? `
      <div class="empty">
        <p>📂 此目录为空</p>
      </div>
    ` : ''}
  </div>

  <!-- 下载码弹窗 -->
  <div id="codeModal" class="code-modal">
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title" id="modalFileName">生成下载码</h3>
        <button class="close-modal" onclick="closeCodeModal()">&times;</button>
      </div>
      <div class="code-info">
        <div class="code-label">下载码</div>
        <div class="code-value" id="downloadCodeValue">加载中...</div>
      </div>
      <div class="code-info">
        <div class="code-label">下载链接</div>
        <div class="code-value" id="downloadUrlValue">加载中...</div>
      </div>
      <div class="code-info">
        <div class="code-label">过期时间</div>
        <div class="code-value" id="expireTimeValue">加载中...</div>
      </div>
      <button class="copy-btn" onclick="copyToClipboard()">复制下载码</button>
    </div>
  </div>

  <script>
    // 下载码弹窗控制
    let currentModalData = null;
    
    function showCodeModal(url, fileName) {
      const modal = document.getElementById('codeModal');
      document.getElementById('modalFileName').textContent = fileName + ' - 下载码';
      
      fetch(url)
        .then(res => res.json())
        .then(data => {
          currentModalData = data;
          document.getElementById('downloadCodeValue').textContent = data.code;
          document.getElementById('downloadUrlValue').textContent = data.downloadUrl;
          document.getElementById('expireTimeValue').textContent = new Date(data.expireAt).toLocaleString('zh-CN');
        })
        .catch(err => {
          document.getElementById('downloadCodeValue').textContent = '生成失败：' + err.message;
        });
      
      modal.style.display = 'flex';
    }
    
    function closeCodeModal() {
      document.getElementById('codeModal').style.display = 'none';
      currentModalData = null;
    }
    
    // 复制到剪贴板
    function copyToClipboard() {
      if (!currentModalData) return;
      navigator.clipboard.writeText(currentModalData.code)
        .then(() => alert('下载码已复制到剪贴板！'))
        .catch(err => alert('复制失败：' + err.message));
    }
    
    // 点击空白处关闭弹窗
    window.onclick = function(event) {
      const codeModal = document.getElementById('codeModal');
      if (event.target === codeModal) closeCodeModal();
    }
  </script>
</body>
</html>
    `;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': config.ALLOWED_ORIGINS.join(','),
      },
    });

  } catch (err) {
    return new Response(`<h1>加载失败</h1><p>${err.message}</p>`, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

// 直接下载文件
async function downloadFileDirectly(fileKey, env, config) {
  const bucket = env[config.R2_BUCKET_NAME];
  const object = await bucket.get(fileKey);

  if (!object) {
    return new Response('文件不存在', { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fileKey.split('/').pop())}"`);
  headers.set('Access-Control-Allow-Origin', config.ALLOWED_ORIGINS.join(','));

  return new Response(object.body, { status: 200, headers });
}

// 生成下载码
async function generateDownloadCode(fileKey, env, config, requestUrl) {
  const bucket = env[config.R2_BUCKET_NAME];
  const object = await bucket.head(fileKey);

  if (!object) {
    return new Response(JSON.stringify({ error: '文件不存在' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const expireTime = timestamp + config.DOWNLOAD_CODE_EXPIRE;
  const rawData = `${fileKey}|${expireTime}`;

  // HMAC-SHA256 签名
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(config.SECRET_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(rawData));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const rawDataB64 = btoa(rawData)
    .替换(/\+/g, '-').替换(/\//g, '_').替换(/=/g, '');
  const downloadCode = `${rawDataB64}。${signatureB64}`;

  return new Response(JSON.stringify({
    code: downloadCode,
    downloadUrl: `${requestUrl.origin}/?code=${downloadCode}`,
    expireAt: new Date(expireTime * 1000).toISOString(),
    fileName: fileKey.split('/').pop(),
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': config.ALLOWED_ORIGINS.join(','),
    },
  });
}

// 验证下载码并下载
async function downloadFileByCode(code, env, config) {
  const [rawDataB64, signatureB64] = code.split('.');
  if (!rawDataB64 || !signatureB64) {
    return new Response('无效的下载码', { status: 400 });
  }

  let rawData;
  try {
    rawData = atob(rawDataB64.替换(/-/g, '+').替换(/_/g, '/'));
  } catch (e) {
    return new Response('下载码格式错误', { status: 400 });
  }

  const [fileKey, expireTimeStr] = rawData.split('|');
  const expireTime = parseInt(expireTimeStr, 10);
  
  if (!fileKey || isNaN(expireTime)) {
    return new Response('下载码解析失败', { status: 400 });
  }

  const currentTime = Math.floor(Date.now() / 1000);
  if (currentTime > expireTime) {
    return new Response('下载码已过期', { status: 410 });
  }

  // 验证签名
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(config.SECRET_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signature = Uint8Array.from(atob(signatureB64.替换(/-/g, '+').替换(/_/g, '/')), c => c.charCodeAt(0));
  const isValid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(rawData));

  if (!isValid) {
    return new Response('下载码验证失败', { status: 403 });
  }

  return downloadFileDirectly(fileKey, env, config);
}
