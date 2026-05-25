import { Button, Form, Input, InputNumber, Radio, Select, Space, Typography, message } from 'antd';
import { FolderOpenOutlined, RocketOutlined } from '@ant-design/icons';

import { api } from '../ipc.js';
import { useTasksStore } from '../stores/tasks-store.js';
import type { NativeIndustry, NativeRatio } from '../../shared/types.js';
import { NATIVE_INDUSTRY_DEFINITIONS } from '../../shared/workflows.js';

interface FormValues {
  industry: NativeIndustry;
  productName?: string;
  brief: string;
  referenceVideoPath?: string;
  variantCount: number;
  durationSec: number;
  ratio: NativeRatio;
}

const INDUSTRY_OPTIONS = Object.values(NATIVE_INDUSTRY_DEFINITIONS).map((definition) => ({
  value: definition.id,
  label: definition.title,
}));

const RATIO_OPTIONS: Array<{ value: NativeRatio; label: string }> = [
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '1:1', label: '1:1' },
];

function durationBounds(industry: NativeIndustry): { min: number; max: number } {
  if (industry === 'short_drama') {
    return { min: 15, max: 300 };
  }
  if (industry === 'novel') {
    return { min: 15, max: 60 };
  }
  return { min: 15, max: 30 };
}

export function Native() {
  const [form] = Form.useForm<FormValues>();
  const createTask = useTasksStore((state) => state.createTask);
  const industry = Form.useWatch('industry', form) ?? 'tool';
  const definition = NATIVE_INDUSTRY_DEFINITIONS[industry];
  const bounds = durationBounds(industry);

  async function pickReferenceVideo() {
    const [path] = await api.asset.pickFiles({
      filters: [{ name: 'Video', extensions: ['mp4', 'mov'] }],
    });
    if (path) {
      form.setFieldValue('referenceVideoPath', path);
    }
  }

  async function submit(values: FormValues) {
    await createTask({
      type: 'native',
      input: {
        industry: values.industry,
        brief: values.brief,
        ...(values.productName ? { productName: values.productName } : {}),
        ...(values.referenceVideoPath ? { referenceVideoPath: values.referenceVideoPath } : {}),
        variantCount: values.variantCount,
        durationSec: values.durationSec,
        ratio: values.ratio,
      },
    });
    form.resetFields();
    void message.success('任务已入队');
  }

  return (
    <section className="section page-panel">
      <Space direction="vertical" size={14} className="form-shell wide">
        <div className="form-header">
          <div>
            <Typography.Title level={4}>创建原生爆款素材</Typography.Title>
            <span>按行业公式生成概念、脚本、分镜和成片素材</span>
          </div>
          <div className="native-strategy">
            <strong>{definition.formula}</strong>
            <span>{definition.requiredModules.join(' / ')}</span>
          </div>
        </div>
        <Form<FormValues>
          form={form}
          className="desktop-form native-form"
          layout="vertical"
          initialValues={{
            industry: 'tool',
            variantCount: 1,
            durationSec: 15,
            ratio: '9:16',
          }}
          onFinish={(values) => void submit(values)}
        >
          <div className="native-form-grid">
            <Form.Item name="industry" label="行业" rules={[{ required: true }]}>
              <Select<NativeIndustry> options={INDUSTRY_OPTIONS} />
            </Form.Item>
            <Form.Item name="productName" label="产品名称">
              <Input placeholder="可选，用于成片命名与脚本聚焦" maxLength={80} />
            </Form.Item>
            <Form.Item name="variantCount" label="生成数量" rules={[{ required: true }]}>
              <InputNumber min={1} max={5} className="number-input" />
            </Form.Item>
            <Form.Item name="durationSec" label="目标时长" rules={[{ required: true }]}>
              <InputNumber min={bounds.min} max={bounds.max} addonAfter="秒" className="number-input" />
            </Form.Item>
          </div>
          <Form.Item name="ratio" label="视频比例" rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid" options={RATIO_OPTIONS} />
          </Form.Item>
          <Form.Item name="referenceVideoPath" label="参考视频">
            <Input
              readOnly
              placeholder="可选，用于保持画面风格或产品上下文"
              addonAfter={
                <Button
                  type="text"
                  className="icon-button"
                  icon={<FolderOpenOutlined />}
                  onClick={() => void pickReferenceVideo()}
                />
              }
            />
          </Form.Item>
          <Form.Item name="brief" label="创意简报" rules={[{ required: true, min: 10 }]}>
            <Input.TextArea
              rows={7}
              placeholder="描述产品、目标人群、卖点、禁用表达、投放场景或希望模仿的节奏。"
              showCount
              maxLength={2000}
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            icon={<RocketOutlined />}
            className="primary-action"
          >
            创建原生爆款任务
          </Button>
        </Form>
      </Space>
    </section>
  );
}
