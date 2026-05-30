import { Button, Form, Input, InputNumber, Radio, Select, Space, Typography, message } from 'antd';
import { FolderOpenOutlined, PlayCircleOutlined } from '@ant-design/icons';

import { api } from '../ipc.js';
import { useTasksStore } from '../stores/tasks-store.js';
import {
  DEFAULT_PRETRAILER_VIDEO_TYPE,
  DEFAULT_VIDEO_RESOLUTION,
  PRETRAILER_VIDEO_TYPE_DEFINITIONS,
  VIDEO_RESOLUTION_OPTIONS,
  type PretrailerStyle,
  type VideoResolution,
} from '../../shared/types.js';

interface FormValues {
  sourceVideoPath: string;
  pretrailerDuration: number;
  style: PretrailerStyle;
  resolution: VideoResolution;
}

export function Pretrailer() {
  const [form] = Form.useForm<FormValues>();
  const createTask = useTasksStore((state) => state.createTask);

  async function pickVideo() {
    const [path] = await api.asset.pickFiles({
      filters: [{ name: 'Video', extensions: ['mp4', 'mov'] }],
    });
    if (path) {
      form.setFieldValue('sourceVideoPath', path);
    }
  }

  async function submit(values: FormValues) {
    await createTask({ type: 'pretrailer', input: values });
    form.resetFields();
    void message.success('任务已入队');
  }

  return (
    <section className="section page-panel">
      <div className="form-shell">
        <div className="form-header">
          <Typography.Title level={4}>选择原广告视频</Typography.Title>
          <span>自动生成开场钩子并拼接到原片前</span>
        </div>
        <Form<FormValues>
          form={form}
          className="desktop-form"
          layout="vertical"
          initialValues={{
            pretrailerDuration: 7,
            style: DEFAULT_PRETRAILER_VIDEO_TYPE,
            resolution: DEFAULT_VIDEO_RESOLUTION,
          }}
          onFinish={(values) => void submit(values)}
        >
          <Form.Item label="原广告视频" required>
            <Space.Compact className="full-width">
              <Form.Item name="sourceVideoPath" noStyle rules={[{ required: true }]}>
                <Input readOnly />
              </Form.Item>
              <Button
                type="default"
                className="file-picker-button"
                icon={<FolderOpenOutlined />}
                aria-label="选择原广告视频"
                onClick={() => void pickVideo()}
              />
            </Space.Compact>
          </Form.Item>
          <Form.Item name="pretrailerDuration" label="前贴时长">
            <InputNumber min={5} max={10} className="number-input" />
          </Form.Item>
          <Form.Item name="style" label="广告前贴视频生成类型">
            <Select
              options={PRETRAILER_VIDEO_TYPE_DEFINITIONS.map((definition) => ({
                value: definition.value,
                label: definition.label,
              }))}
            />
          </Form.Item>
          <Form.Item name="resolution" label="生成分辨率" rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid" options={VIDEO_RESOLUTION_OPTIONS} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<PlayCircleOutlined />} className="primary-action">
            创建前贴任务
          </Button>
        </Form>
      </div>
    </section>
  );
}
