/** 运行端应用入口：从 URL 读取 formId 加载表单 Schema 并渲染，提供 PC/H5 切换。 */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, AppBar, Toolbar, Typography, ToggleButton, ToggleButtonGroup, Box, CircularProgress, Alert } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import '@mui/material/styles';
import type { FormSchema } from '@hengyida/shared/types/form';
import { api, ApiError } from './api/client';
import { PcAdapter } from './adapters/PcAdapter';
import { H5Adapter } from './adapters/H5Adapter';
import { PageRenderer } from './renderer/PageRenderer';
import type { AdapterType } from './adapters/AdapterContext';
import './index.css';

// 恒信 VI 品牌令牌（《恒信 VI 视觉识别系统手册》V1.1）：单一深蓝色系，无橙色/渐变/阴影
const theme = createTheme({
  palette: {
    primary: { main: '#1B3D73', dark: '#13305C' }, // 基石深蓝
    secondary: { main: '#13305C' }, // 单色系：沿用深蓝加深
    background: { default: '#E8EFF8', paper: '#FFFFFF' }, // 浅雾蓝 / 纯白
    text: { primary: '#1A1A1A', secondary: '#9AA4B2' }, // 墨黑 / 中灰
  },
  typography: {
    fontFamily:
      '"Source Han Sans SC", "Noto Sans SC", "Source Sans 3", "Alibaba PuHuiTi", "Microsoft YaHei", system-ui, sans-serif',
  },
});

function extractFormSchema(envelope: unknown): FormSchema | null {
  const env = envelope as { payload?: FormSchema; fields?: unknown };
  if (env?.payload) return env.payload;
  if (env?.fields) return env as FormSchema;
  return null;
}

function App() {
  const formId = new URLSearchParams(window.location.search).get('formId') ?? 'form_demo';
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [adapter, setAdapter] = useState<AdapterType>('pc');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getFormSchema(formId)
      .then((env) => {
        const s = extractFormSchema(env);
        if (s) setSchema(s);
        else setError('表单配置格式不正确');
      })
      .catch((err) => {
        // 后端未就绪时展示占位 Schema，保证前端可独立预览与开发
        if (err instanceof ApiError && (err.code === 500 || err.code === 1004)) {
          setSchema({
            schemaVersion: '1.0.0',
            kind: 'form',
            id: formId,
            fields: [],
            layout: { pc: [], h5: [] },
            listView: { columns: [], filters: [], sort: [], pageSize: 20 },
          });
        } else {
          setError(err instanceof Error ? err.message : '加载表单失败');
        }
      })
      .finally(() => setLoading(false));
  }, [formId]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="static" color="primary">
        <Toolbar>
          <Box component="img" src="/brand/logo-symbol-reverse.png" alt="恒信标志" sx={{ width: 36, height: 36, objectFit: 'contain', mr: 1.5 }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            恒易搭 · 运行端
          </Typography>
          <ToggleButtonGroup
            size="small"
            color="primary"
            value={adapter}
            exclusive
            onChange={(_, v) => v && setAdapter(v as AdapterType)}
          >
            <ToggleButton value="pc">PC</ToggleButton>
            <ToggleButton value="h5">H5</ToggleButton>
          </ToggleButtonGroup>
        </Toolbar>
      </AppBar>
      <Box sx={{ maxWidth: adapter === 'pc' ? 1200 : 480, mx: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        ) : schema ? (
          adapter === 'pc' ? (
            <PcAdapter>
              <Box sx={{ gridColumn: '1 / -1' }}>
                <PageRenderer schema={schema} pageType="form" />
              </Box>
            </PcAdapter>
          ) : (
            <H5Adapter>
              <PageRenderer schema={schema} pageType="form" />
            </H5Adapter>
          )
        ) : null}
      </Box>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
