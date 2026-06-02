import { Button, Form, Input, InputNumber, Select, Switch, Typography, message } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';

import { useTasksStore } from '../stores/tasks-store.js';
import {
  COPYWRITING_SCRIPT_FORMAT_DEFINITIONS,
  type CopywritingIndustry,
  type CopywritingScriptFormat,
} from '../../shared/types.js';
import { NATIVE_INDUSTRY_DEFINITIONS } from '../../shared/workflows.js';

interface FormValues {
  industry: CopywritingIndustry;
  requirement: string;
  productName?: string;
  audience?: string;
  platform?: string;
  format: CopywritingScriptFormat;
  variantCount: number;
  durationSec: number;
  enableWebSearch: boolean;
}

const FORMAT_OPTIONS = COPYWRITING_SCRIPT_FORMAT_DEFINITIONS.map((definition) => ({
  value: definition.value,
  label: definition.label,
}));

const INDUSTRY_OPTIONS: Array<{ value: CopywritingIndustry; label: string }> = [
  { value: 'auto', label: '智能匹配' },
  ...Object.values(NATIVE_INDUSTRY_DEFINITIONS).map((definition) => ({
    value: definition.id,
    label: definition.title,
  })),
];

const DEFAULT_FORMAT_DEFINITION = {
  value: 'short_video' as const,
  label: '短视频脚本',
  description: '适合信息流短视频、达人口播、AIGC 视频生成前的脚本文案。',
};

export function Copywriting() {
  const [form] = Form.useForm<FormValues>();
  const createTask = useTasksStore((state) => state.createTask);
  const industry = Form.useWatch('industry', form) ?? 'auto';
  const format = Form.useWatch('format', form) ?? 'short_video';
  const formatDefinition =
    COPYWRITING_SCRIPT_FORMAT_DEFINITIONS.find((definition) => definition.value === format) ??
    DEFAULT_FORMAT_DEFINITION;
  const industryDefinition =
    industry === 'auto' ? undefined : NATIVE_INDUSTRY_DEFINITIONS[industry];
  const templateTitle = industryDefinition?.title ?? '智能匹配行业模板';
  const templateDescription =
    industryDefinition?.formula ?? '先从游戏、短剧、小说、社交、工具、电商中匹配模板，再进入大模型优化。';

  async function submit(values: FormValues) {
    await createTask({
      type: 'copywriting',
      input: {
        industry: values.industry,
        requirement: values.requirement,
        ...(values.productName ? { productName: values.productName } : {}),
        ...(values.audience ? { audience: values.audience } : {}),
        ...(values.platform ? { platform: values.platform } : {}),
        format: values.format,
        variantCount: values.variantCount,
        durationSec: values.durationSec,
        enableWebSearch: values.enableWebSearch,
      },
    });
    form.resetFields();
    void message.success('广告文案脚本任务已入队');
  }

  return (
    <section className="section page-panel">
      <div className="form-shell wide">
        <div className="form-header">
          <div>
            <Typography.Title level={4}>创建广告文案脚本</Typography.Title>
            <span>先匹配行业模板，再用大模型优化策略并生成多版本爆款脚本</span>
          </div>
          <div className="native-strategy">
            <strong>{templateTitle} · {formatDefinition.label}</strong>
            <span>{templateDescription}</span>
          </div>
        </div>
        <Form<FormValues>
          form={form}
          className="desktop-form native-form"
          layout="vertical"
          initialValues={{
            industry: 'auto',
            format: 'short_video',
            variantCount: 3,
            durationSec: 30,
            enableWebSearch: true,
          }}
          onFinish={(values) => void submit(values)}
        >
          <div className="native-form-grid">
            <Form.Item name="industry" label="行业模板" rules={[{ required: true }]}>
              <Select<CopywritingIndustry> options={INDUSTRY_OPTIONS} />
            </Form.Item>
            <Form.Item name="format" label="脚本形式" rules={[{ required: true }]}>
              <Select<CopywritingScriptFormat> options={FORMAT_OPTIONS} />
            </Form.Item>
            <Form.Item name="variantCount" label="脚本数量" rules={[{ required: true }]}>
              <InputNumber min={1} max={5} className="number-input" />
            </Form.Item>
            <Form.Item name="durationSec" label="目标时长" rules={[{ required: true }]}>
              <InputNumber min={15} max={120} suffix="秒" className="number-input" />
            </Form.Item>
            <Form.Item name="enableWebSearch" label="联网补充" valuePropName="checked">
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
          </div>
          <div className="native-form-grid">
            <Form.Item name="productName" label="产品名称">
              <Input placeholder="可选，用于聚焦文案主体" maxLength={100} />
            </Form.Item>
            <Form.Item name="audience" label="目标人群">
              <Input placeholder="例如：25-35 岁通勤女性、游戏买量用户" maxLength={200} />
            </Form.Item>
            <Form.Item name="platform" label="投放平台">
              <Input placeholder="例如：抖音、巨量千川、小红书、直播间" maxLength={80} />
            </Form.Item>
          </div>
          <Form.Item
            name="requirement"
            label="文案需求"
            rules={[{ required: true, min: 10, message: '请至少输入 10 个字的需求' }]}
          >
            <Input.TextArea
              rows={8}
              placeholder="描述产品、卖点、目标人群、禁用表达、投放场景、想要的风格或参考方向。"
              showCount
              maxLength={4000}
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            icon={<FileTextOutlined />}
            className="primary-action"
          >
            生成广告脚本
          </Button>
        </Form>
      </div>
    </section>
  );
}
