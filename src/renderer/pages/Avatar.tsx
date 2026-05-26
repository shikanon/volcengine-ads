import { Button, Form, Input, InputNumber, Space, Typography, message } from 'antd';
import { FolderOpenOutlined, UserOutlined } from '@ant-design/icons';

import { api } from '../ipc.js';
import { useTasksStore } from '../stores/tasks-store.js';

interface FormValues {
  avatarImagePath: string;
  brandIntro: string;
  productImagePaths: string[];
  duration: number;
}

export function Avatar() {
  const [form] = Form.useForm<FormValues>();
  const createTask = useTasksStore((state) => state.createTask);

  async function pickAvatar() {
    const [path] = await api.asset.pickFiles({
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg'] }],
    });
    if (path) form.setFieldValue('avatarImagePath', path);
  }

  async function pickProducts() {
    const paths = await api.asset.pickFiles({
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg'] }],
      multi: true,
    });
    if (paths.length > 0) form.setFieldValue('productImagePaths', paths.slice(0, 3));
  }

  async function submit(values: FormValues) {
    await createTask({ type: 'avatar', input: values });
    form.resetFields();
    void message.success('任务已入队');
  }

  return (
    <section className="section page-panel">
      <div className="form-shell">
        <div className="form-header">
          <Typography.Title level={4}>配置数字人口播</Typography.Title>
          <span>输入品牌资料和产品图，生成口播成片</span>
        </div>
        <Form<FormValues>
          form={form}
          className="desktop-form"
          layout="vertical"
          initialValues={{ duration: 30, productImagePaths: [] }}
          onFinish={(values) => void submit(values)}
        >
          <Form.Item label="数字人图片" required>
            <Space.Compact className="full-width">
              <Form.Item name="avatarImagePath" noStyle rules={[{ required: true }]}>
                <Input readOnly />
              </Form.Item>
              <Button
                type="default"
                className="file-picker-button"
                icon={<FolderOpenOutlined />}
                aria-label="选择数字人图片"
                onClick={() => void pickAvatar()}
              />
            </Space.Compact>
          </Form.Item>
          <Form.Item name="brandIntro" label="品牌介绍" rules={[{ required: true }]}>
            <Input.TextArea rows={5} />
          </Form.Item>
          <Form.Item
            name="productImagePaths"
            label="产品图"
            rules={[{ required: true }]}
            getValueProps={(value?: string[]) => ({ value: (value ?? []).join('\n') })}
          >
            <Input.TextArea readOnly rows={3} />
          </Form.Item>
          <Button className="secondary-button" icon={<FolderOpenOutlined />} onClick={() => void pickProducts()}>
            选择产品图
          </Button>
          <Form.Item name="duration" label="视频时长">
            <InputNumber min={15} max={60} className="number-input" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<UserOutlined />} className="primary-action">
            创建口播任务
          </Button>
        </Form>
      </div>
    </section>
  );
}
