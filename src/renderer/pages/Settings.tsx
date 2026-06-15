import { Button, Form, Input, InputNumber, Select, Switch, Typography, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useEffect } from 'react';

import { useSettingsStore } from '../stores/settings-store.js';
import {
  PRETRAILER_VIDEO_TYPE_DEFINITIONS,
  SUPPORTED_TTS_SPEAKERS,
  type SettingsUpdate,
} from '../../shared/types.js';

export function Settings() {
  const [form] = Form.useForm<SettingsUpdate>();
  const { settings, loadSettings, saveSettings } = useSettingsStore();

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (settings) {
      const values: SettingsUpdate = {
        concurrency: settings.concurrency,
        defaultPretrailerStyle: settings.defaultPretrailerStyle,
        complianceAccepted: settings.complianceAccepted,
        provider: settings.provider,
      };
      if (settings.seedanceApiKey) values.seedanceApiKey = settings.seedanceApiKey;
      if (settings.imageApiKey) values.imageApiKey = settings.imageApiKey;
      if (settings.llmApiKey) values.llmApiKey = settings.llmApiKey;
      if (settings.douyinCookie) values.douyinCookie = settings.douyinCookie;
      if (settings.ttsApiKey) values.ttsApiKey = settings.ttsApiKey;
      if (settings.ttsAppId) values.ttsAppId = settings.ttsAppId;
      if (settings.ttsToken) values.ttsToken = settings.ttsToken;
      if (settings.asrApiKey) values.asrApiKey = settings.asrApiKey;
      if (settings.asrAppId) values.asrAppId = settings.asrAppId;
      if (settings.asrToken) values.asrToken = settings.asrToken;
      if (settings.ossAccessKeyId) values.ossAccessKeyId = settings.ossAccessKeyId;
      if (settings.ossAccessKeySecret) values.ossAccessKeySecret = settings.ossAccessKeySecret;
      form.setFieldsValue(values);
    }
  }, [form, settings]);

  async function submit(values: SettingsUpdate) {
    await saveSettings(values);
    void message.success('设置已保存');
  }

  return (
    <section className="section page-panel">
      <div className="form-shell wide">
        <div className="form-header">
          <Typography.Title level={4}>模型服务配置</Typography.Title>
          <span>本地私有化配置会从数据库读取并回填，方便直接检查和修改</span>
        </div>
        <Form<SettingsUpdate>
          form={form}
          className="desktop-form settings-form"
          layout="vertical"
          onFinish={(values) => void submit(values)}
        >
          <div className="settings-grid">
            <section className="settings-section">
              <Typography.Title level={5}>生成模型</Typography.Title>
              <Form.Item
                name="seedanceApiKey"
                label={`Seedance API Key${settings?.seedanceConfigured ? '（已配置）' : ''}`}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name={['provider', 'seedanceBaseUrl']} label="Seedance Base URL">
                <Input />
              </Form.Item>
              <Form.Item name={['provider', 'seedanceModel']} label="Seedance 模型 ID">
                <Input />
              </Form.Item>
              <Form.Item
                name="imageApiKey"
                label={`图片生成 API Key${settings?.imageConfigured ? '（已配置）' : ''}`}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name={['provider', 'imageBaseUrl']} label="图片生成 Base URL">
                <Input />
              </Form.Item>
              <Form.Item name={['provider', 'imageModel']} label="图片生成模型 ID">
                <Input />
              </Form.Item>
              <Form.Item
                name="llmApiKey"
                label={`LLM API Key${settings?.llmConfigured ? '（已配置）' : ''}`}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name={['provider', 'llmBaseUrl']} label="LLM Base URL">
                <Input />
              </Form.Item>
              <Form.Item name={['provider', 'llmModel']} label="LLM 模型 ID">
                <Input />
              </Form.Item>
            </section>

            <section className="settings-section">
              <Typography.Title level={5}>语音服务</Typography.Title>
              <Form.Item
                name="ttsApiKey"
                label={`TTS API Key${settings?.ttsConfigured ? '（已配置）' : ''}`}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name={['provider', 'ttsBaseUrl']} label="TTS Base URL">
                <Input />
              </Form.Item>
              <Form.Item name={['provider', 'ttsVoice']} label="TTS 默认音色">
                <Select
                  options={SUPPORTED_TTS_SPEAKERS.map((speaker) => ({
                    value: speaker,
                    label: speaker,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="asrApiKey"
                label={`ASR API Key${settings?.asrConfigured ? '（已配置）' : ''}`}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="asrAppId"
                label={`ASR AppID${settings?.asrConfigured ? '（已配置）' : ''}`}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name="asrToken" label="ASR Access Token">
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name={['provider', 'asrBaseUrl']} label="ASR Base URL">
                <Input />
              </Form.Item>
              <Form.Item name={['provider', 'asrResourceId']} label="ASR Resource ID">
                <Input />
              </Form.Item>
            </section>

            <section className="settings-section">
              <Typography.Title level={5}>对象存储</Typography.Title>
              <Form.Item name="ossAccessKeyId" label="OSS AccessKey ID">
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name="ossAccessKeySecret" label="OSS AccessKey Secret">
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name={['provider', 'ossEndpoint']} label="OSS Endpoint">
                <Input />
              </Form.Item>
              <Form.Item name={['provider', 'ossBucketName']} label="OSS Bucket">
                <Input />
              </Form.Item>
            </section>

            <section className="settings-section">
              <Typography.Title level={5}>本地行为</Typography.Title>
              <Form.Item
                name="douyinCookie"
                label="抖音 Cookie"
                extra="可选。把 Chrome 开发者工具里请求头中的 Cookie 原文粘贴到这里；裂变任务下载抖音视频时会优先使用该配置。"
              >
                <Input.TextArea
                  autoSize={{ minRows: 4, maxRows: 8 }}
                  placeholder="示例：sessionid=...; ttwid=...; passport_csrf_token=..."
                />
              </Form.Item>
              <Form.Item name="concurrency" label="并发任务数">
                <InputNumber min={1} max={2} className="number-input" />
              </Form.Item>
              <Form.Item name="defaultPretrailerStyle" label="默认广告前贴视频生成类型">
                <Select
                  options={PRETRAILER_VIDEO_TYPE_DEFINITIONS.map((definition) => ({
                    value: definition.value,
                    label: definition.label,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="complianceAccepted"
                label="已确认版权合规提示"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </section>
          </div>

          <div className="form-actions">
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              className="primary-action"
            >
              保存设置
            </Button>
          </div>
        </Form>
      </div>
    </section>
  );
}
