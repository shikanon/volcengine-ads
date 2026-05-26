import { Button, Form, Input, InputNumber, Select, Space, Typography, message } from 'antd';
import { FolderOpenOutlined, PlayCircleOutlined } from '@ant-design/icons';

import { api } from '../ipc.js';
import { useTasksStore } from '../stores/tasks-store.js';
import type { PretrailerStyle } from '../../shared/types.js';

interface FormValues {
  sourceVideoPath: string;
  pretrailerDuration: number;
  style: PretrailerStyle;
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
          initialValues={{ pretrailerDuration: 7, style: 'auto' }}
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
          <Form.Item name="style" label="风格偏好">
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
          <Button type="primary" htmlType="submit" icon={<PlayCircleOutlined />} className="primary-action">
            创建前贴任务
          </Button>
        </Form>
      </div>
    </section>
  );
}
