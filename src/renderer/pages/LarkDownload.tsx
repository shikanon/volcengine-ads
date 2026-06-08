import { Button, Form, Input, Typography, message } from 'antd';
import { DownloadOutlined, LinkOutlined } from '@ant-design/icons';

import { useTasksStore } from '../stores/tasks-store.js';

interface FormValues {
  url: string;
  outputDir?: string;
}

export function LarkDownload() {
  const [form] = Form.useForm<FormValues>();
  const createTask = useTasksStore((state) => state.createTask);

  async function submit(values: FormValues) {
    await createTask({
      type: 'lark_download',
      input: {
        url: values.url,
        ...(values.outputDir?.trim() ? { outputDir: values.outputDir.trim() } : {}),
      },
    });
    form.resetFields();
    void message.success('飞书视频下载任务已入队');
  }

  return (
    <section className="section page-panel">
      <div className="form-shell wide">
        <div className="form-header">
          <div>
            <Typography.Title level={4}>下载飞书文档中的视频</Typography.Title>
            <span>粘贴飞书 `wiki` 或 `docx` 链接，任务会在后台解析页面并下载可访问的视频文件。</span>
          </div>
          <div className="native-strategy">
            <strong>最小入口</strong>
            <span>复用现有任务队列、步骤进度和任务详情，不额外引入新的下载面板状态。</span>
          </div>
        </div>

        <div className="lark-download-layout">
          <Form<FormValues>
            form={form}
            className="desktop-form"
            layout="vertical"
            initialValues={{ url: '', outputDir: '' }}
            onFinish={(values) => void submit(values)}
          >
            <Form.Item
              name="url"
              label="飞书链接"
              rules={[
                { required: true, message: '请输入飞书文档链接' },
                { type: 'url', message: '请输入合法链接' },
              ]}
            >
              <Input
                prefix={<LinkOutlined />}
                placeholder="https://bytedance.feishu.cn/wiki/..."
                allowClear
              />
            </Form.Item>
            <Form.Item
              name="outputDir"
              label="输出目录"
              extra="可选。留空时默认写入当前任务产物目录下的 downloads 子目录；如填写，需使用绝对路径。"
            >
              <Input
                placeholder="/Users/you/Downloads/lark-videos"
                allowClear
              />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<DownloadOutlined />}
              className="primary-action"
            >
              创建下载任务
            </Button>
          </Form>

          <div className="lark-download-notes" aria-label="下载说明">
            <section className="lark-download-note-card">
              <Typography.Text strong>输出说明</Typography.Text>
              <ul>
                <li>默认会把视频和 `download-summary.json` 写入任务产物目录，方便在最近任务中直接查看。</li>
                <li>如果填写输出目录，系统会在该目录下按飞书文档 token 创建子目录，避免不同任务互相覆盖。</li>
              </ul>
            </section>
            <section className="lark-download-note-card">
              <Typography.Text strong>结果说明</Typography.Text>
              <ul>
                <li>任务详情会展示下载步骤、汇总文件路径和失败原因，便于重试或定位问题。</li>
                <li>当飞书登录态失效时，任务会失败并提示重新登录后再试。</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
