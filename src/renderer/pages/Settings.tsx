import { Button, Form, Input, InputNumber, Select, Space, Switch, Typography, message } from 'antd';
import { useEffect } from 'react';

import { useSettingsStore } from '../stores/settings-store.js';
import type { SettingsUpdate } from '../../shared/types.js';

export function Settings() {
  const [form] = Form.useForm<SettingsUpdate>();
  const { settings, loadSettings, saveSettings } = useSettingsStore();

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (settings) {
      form.setFieldsValue({
        concurrency: settings.concurrency,
        defaultPretrailerStyle: settings.defaultPretrailerStyle,
        complianceAccepted: settings.complianceAccepted,
        provider: settings.provider,
      });
    }
  }, [form, settings]);

  async function submit(values: SettingsUpdate) {
    await saveSettings(values);
    form.resetFields(['seedanceApiKey', 'llmApiKey', 'ttsAppId', 'ttsToken', 'asrApiKey']);
    void message.success('设置已保存');
  }

  return (
    <section className="section">
      <Space direction="vertical" size={14} className="form-shell wide">
        <Typography.Title level={4}>模型服务配置</Typography.Title>
        <Form<SettingsUpdate> form={form} layout="vertical" onFinish={(values) => void submit(values)}>
          <Form.Item name="seedanceApiKey" label={`Seedance API Key${settings?.seedanceConfigured ? '（已配置）' : ''}`}>
            <Input.Password autoComplete="off" />
          </Form.Item>
          <Form.Item name={['provider', 'seedanceBaseUrl']} label="Seedance Base URL">
            <Input />
          </Form.Item>
          <Form.Item name={['provider', 'seedanceModel']} label="Seedance 模型 ID">
            <Input />
          </Form.Item>
          <Form.Item name="llmApiKey" label={`LLM API Key${settings?.llmConfigured ? '（已配置）' : ''}`}>
            <Input.Password autoComplete="off" />
          </Form.Item>
          <Form.Item name={['provider', 'llmBaseUrl']} label="LLM Base URL">
            <Input />
          </Form.Item>
          <Form.Item name={['provider', 'llmModel']} label="LLM 模型 ID">
            <Input />
          </Form.Item>
          <Form.Item name="ttsAppId" label={`TTS AppId${settings?.ttsConfigured ? '（已配置）' : ''}`}>
            <Input.Password autoComplete="off" />
          </Form.Item>
          <Form.Item name="ttsToken" label="TTS Token">
            <Input.Password autoComplete="off" />
          </Form.Item>
          <Form.Item name={['provider', 'ttsBaseUrl']} label="TTS Base URL">
            <Input />
          </Form.Item>
          <Form.Item name="asrApiKey" label={`ASR API Key${settings?.asrConfigured ? '（已配置）' : ''}`}>
            <Input.Password autoComplete="off" />
          </Form.Item>
          <Form.Item name={['provider', 'asrBaseUrl']} label="ASR Base URL">
            <Input />
          </Form.Item>
          <Form.Item name="concurrency" label="并发任务数">
            <InputNumber min={1} max={2} />
          </Form.Item>
          <Form.Item name="defaultPretrailerStyle" label="默认前贴风格">
            <Select
              options={[
                { value: 'auto', label: '自动推荐' },
                { value: 'suspense', label: '悬念' },
                { value: 'contrast', label: '反差' },
                { value: 'pain', label: '痛点' },
                { value: 'benefit', label: '福利' },
              ]}
            />
          </Form.Item>
          <Form.Item name="complianceAccepted" label="已确认版权合规提示" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            保存设置
          </Button>
        </Form>
      </Space>
    </section>
  );
}
