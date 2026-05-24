import { Button, Form, Input, InputNumber, Space, Typography, message } from 'antd';

import { useTasksStore } from '../stores/tasks-store.js';

interface FormValues {
  douyinUrl: string;
  variantCount: number;
}

export function Explosion() {
  const [form] = Form.useForm<FormValues>();
  const createTask = useTasksStore((state) => state.createTask);

  async function submit(values: FormValues) {
    await createTask({
      type: 'explosion',
      input: {
        douyinUrl: values.douyinUrl,
        variantCount: values.variantCount,
      },
    });
    form.resetFields();
    void message.success('任务已入队');
  }

  return (
    <section className="section">
      <Space direction="vertical" size={14} className="form-shell">
        <Typography.Title level={4}>输入爆款链接</Typography.Title>
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{ variantCount: 3 }}
          onFinish={(values) => void submit(values)}
        >
          <Form.Item name="douyinUrl" label="抖音视频链接" rules={[{ required: true }]}>
            <Input placeholder="粘贴完整链接、短链或分享口令" />
          </Form.Item>
          <Form.Item name="variantCount" label="裂变数量" rules={[{ required: true }]}>
            <InputNumber min={1} max={10} />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            创建裂变任务
          </Button>
        </Form>
      </Space>
    </section>
  );
}
