import { Button, Form, Input, InputNumber, Radio, Space, Typography, message } from 'antd';
import { FolderOpenOutlined, ThunderboltOutlined } from '@ant-design/icons';

import { SelectedAssetList } from '../components/SelectedAssetList.js';
import { api } from '../ipc.js';
import { useTasksStore } from '../stores/tasks-store.js';
import {
  DEFAULT_VIDEO_RESOLUTION,
  VIDEO_RESOLUTION_OPTIONS,
  type VideoResolution,
} from '../../shared/types.js';

type SourceMode = 'douyin' | 'local';

interface FormValues {
  sourceMode: SourceMode;
  douyinUrl?: string;
  sourceVideoPath?: string;
  variantCount: number;
  resolution: VideoResolution;
}

export function Explosion() {
  const [form] = Form.useForm<FormValues>();
  const sourceMode = Form.useWatch('sourceMode', form) ?? 'douyin';
  const sourceVideoPath = Form.useWatch('sourceVideoPath', form);
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
    const input =
      values.sourceMode === 'local'
        ? values.sourceVideoPath
          ? {
              sourceVideoPath: values.sourceVideoPath,
              variantCount: values.variantCount,
              resolution: values.resolution,
            }
          : undefined
        : values.douyinUrl
          ? {
              douyinUrl: values.douyinUrl,
              variantCount: values.variantCount,
              resolution: values.resolution,
            }
          : undefined;
    if (!input) {
      void message.error('请选择或填写爆款素材');
      return;
    }
    await createTask({
      type: 'explosion',
      input,
    });
    form.resetFields();
    void message.success('任务已入队');
  }

  return (
    <section className="section page-panel">
      <div className="form-shell">
        <div className="form-header">
          <Typography.Title level={4}>选择爆款素材</Typography.Title>
          <span>从抖音链接或本地视频生成多版本广告变体</span>
        </div>
        <Form<FormValues>
          form={form}
          className="desktop-form"
          layout="vertical"
          initialValues={{
            sourceMode: 'douyin',
            variantCount: 3,
            resolution: DEFAULT_VIDEO_RESOLUTION,
          }}
          onFinish={(values) => void submit(values)}
        >
          <Form.Item name="sourceMode" label="视频来源">
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={[
                { value: 'douyin', label: '抖音链接' },
                { value: 'local', label: '本地视频' },
              ]}
            />
          </Form.Item>
          {sourceMode === 'douyin' ? (
            <Form.Item name="douyinUrl" label="抖音视频链接" rules={[{ required: true }]}>
              <Input placeholder="粘贴完整链接、短链或分享口令" />
            </Form.Item>
          ) : (
            <Form.Item label="本地视频" required>
              <Space.Compact className="full-width">
                <Form.Item name="sourceVideoPath" noStyle rules={[{ required: true }]}>
                  <Input readOnly placeholder="选择本地爆款视频后将在下方显示" />
                </Form.Item>
                <Button
                  type="default"
                  className="file-picker-button"
                  icon={<FolderOpenOutlined />}
                  aria-label="选择本地视频"
                  onClick={() => void pickVideo()}
                />
              </Space.Compact>
              <SelectedAssetList label="已选择本地视频" paths={sourceVideoPath ? [sourceVideoPath] : []} />
            </Form.Item>
          )}
          <Form.Item name="variantCount" label="裂变数量" rules={[{ required: true }]}>
            <InputNumber min={1} max={10} className="number-input" />
          </Form.Item>
          <Form.Item name="resolution" label="生成分辨率" rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid" options={VIDEO_RESOLUTION_OPTIONS} />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            icon={<ThunderboltOutlined />}
            className="primary-action"
          >
            创建裂变任务
          </Button>
        </Form>
      </div>
    </section>
  );
}
