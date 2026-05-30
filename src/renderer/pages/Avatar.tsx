import { useState } from 'react';

import { Button, Form, Input, InputNumber, Radio, Space, Typography, message } from 'antd';
import { FolderOpenOutlined, UserOutlined } from '@ant-design/icons';

import { api } from '../ipc.js';
import { useTasksStore } from '../stores/tasks-store.js';
import {
  DEFAULT_VIDEO_RESOLUTION,
  VIDEO_RESOLUTION_OPTIONS,
  type VideoResolution,
} from '../../shared/types.js';

interface FormValues {
  avatarImagePath: string;
  brandIntro: string;
  productImagePaths: string[];
  duration: number;
  resolution: VideoResolution;
}

export function Avatar() {
  const [form] = Form.useForm<FormValues>();
  const createTask = useTasksStore((state) => state.createTask);
  const [submitting, setSubmitting] = useState(false);

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
    setSubmitting(true);
    try {
      await createTask({ type: 'avatar', input: values });
      form.resetFields();
      void message.success('任务已入队');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void message.error(detail);
    } finally {
      setSubmitting(false);
    }
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
          initialValues={{
            duration: 30,
            productImagePaths: [],
            resolution: DEFAULT_VIDEO_RESOLUTION,
          }}
          onFinish={(values) => void submit(values)}
        >
          <Form.Item label="数字人图片" required>
            <Space.Compact className="full-width">
              <Form.Item
                name="avatarImagePath"
                noStyle
                rules={[{ required: true, message: '请选择数字人图片' }]}
              >
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
          <Form.Item
            name="brandIntro"
            label="品牌介绍"
            rules={[
              { required: true, message: '请输入品牌介绍' },
              { min: 20, message: '品牌介绍至少 20 字' },
              { max: 1000, message: '品牌介绍不能超过 1000 字' },
            ]}
          >
            <Input.TextArea rows={5} />
          </Form.Item>
          <Form.Item
            name="productImagePaths"
            label="产品图"
            rules={[
              {
                validator: (_rule, value: unknown) => {
                  if (!Array.isArray(value) || value.length < 1) {
                    return Promise.reject(new Error('请选择 1..3 张产品图'));
                  }
                  if (value.length > 3) {
                    return Promise.reject(new Error('产品图最多选择 3 张'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
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
          <Form.Item name="resolution" label="生成分辨率" rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid" options={VIDEO_RESOLUTION_OPTIONS} />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            icon={<UserOutlined />}
            className="primary-action"
            loading={submitting}
          >
            创建口播任务
          </Button>
        </Form>
      </div>
    </section>
  );
}
