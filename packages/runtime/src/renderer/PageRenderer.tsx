/**
 * 页面渲染器：根据表单 Schema 渲染「填报页」或「数据列表页」。
 * 页面类型来自 AppSchema.Page.type（form / list）。
 */
import { Alert, Typography, Box } from '@mui/material';
import type { FormSchema } from '@hengyida/shared/types/form';
import { DataForm } from '../components/DataForm';
import { DataList } from '../components/DataList';

interface Props {
  schema: FormSchema;
  pageType: 'form' | 'list' | 'custom';
  readonly?: boolean;
  onSubmitted?: () => void;
}

export function PageRenderer({ schema, pageType, readonly, onSubmitted }: Props) {
  if (!schema) {
    return <Alert severity="warning">表单配置为空，无法渲染页面</Alert>;
  }

  if (pageType === 'list') {
    return <DataList schema={schema} />;
  }
  if (pageType === 'custom') {
    return (
      <Box>
        <Typography variant="body2" color="text.secondary">
          自定义页面（Phase 2 支持）
        </Typography>
      </Box>
    );
  }
  return <DataForm schema={schema} readonly={readonly} onSubmitted={onSubmitted} />;
}
