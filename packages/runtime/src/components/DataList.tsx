/**
 * 数据列表：按 listView.columns 展示，支持筛选/排序/分页（params 传给服务端）。
 * 一期内联筛选输入，排序点击表头切换。
 */
import { useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
  Button,
  TextField,
  Alert,
} from '@mui/material';
import type { FormSchema } from '@hengyida/shared/types/form';
import type { DataQuery } from '@hengyida/shared/types/data';
import { api, ApiError } from '../api/client';

interface Props {
  schema: FormSchema;
}

export function DataList({ schema }: Props) {
  const [query, setQuery] = useState<DataQuery>({ page: 1, pageSize: schema.listView.pageSize || 20 });
  const [rows, setRows] = useState<Array<Record<string, unknown> & { values?: Record<string, unknown> }>>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  const columns = schema.listView.columns;
  const fieldLabels: Record<string, string> = Object.fromEntries(
    schema.fields.map((f) => [f.id, f.label]),
  );

  const load = async () => {
    setError(null);
    try {
      const filters = keyword
        ? [{ fieldId: columns[0], op: 'contains' as const, value: keyword }]
        : query.filters;
      const result = await api.listRecords<{ list: Array<Record<string, unknown>>; total: number }>(
        schema.id,
        { ...query, filters },
      );
      setRows(result.list ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载数据失败');
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.page, query.pageSize, query.sort]);

  const toggleSort = (fieldId: string) => {
    const current = query.sort?.find((s) => s.fieldId === fieldId);
    const order = current?.order === 'asc' ? 'desc' : 'asc';
    setQuery((q) => ({ ...q, sort: [{ fieldId, order }] }));
  };

  const pageSize = query.pageSize ?? 20;
  const page = query.page ?? 1;

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
        <TextField
          size="small"
          label="搜索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setQuery((q) => ({ ...q, page: 1 })); void load(); } }}
        />
        <Button variant="outlined" onClick={() => { setQuery((q) => ({ ...q, page: 1 })); void load(); }}>
          查询
        </Button>
      </Box>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell key={c} onClick={() => toggleSort(c)} sx={{ cursor: 'pointer', fontWeight: 600 }}>
                  {fieldLabels[c] ?? c}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={String(row.id ?? i)}>
                {columns.map((c) => (
                  <TableCell key={c}>{String(row.values?.[c] ?? row[c] ?? '')}</TableCell>
                ))}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} align="center">
                  暂无数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button size="small" disabled={page <= 1} onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) - 1 }))}>
          上一页
        </Button>
        <span>第 {page} 页 / 共 {Math.max(1, Math.ceil(total / pageSize))} 页（{total} 条）</span>
        <Button
          size="small"
          disabled={page * pageSize >= total}
          onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) + 1 }))}
        >
          下一页
        </Button>
      </Box>
    </Box>
  );
}
