import { useState } from 'react';
import { Button, Form, Input, InputNumber, Radio, Select, Space, Typography, message } from 'antd';
import { FolderOpenOutlined, RocketOutlined } from '@ant-design/icons';

import { SelectedAssetList } from '../components/SelectedAssetList.js';
import { api } from '../ipc.js';
import { useTasksStore } from '../stores/tasks-store.js';
import {
  DEFAULT_VIDEO_RESOLUTION,
  VIDEO_RESOLUTION_OPTIONS,
  type NativeIndustry,
  type NativeRatio,
  type VideoResolution,
} from '../../shared/types.js';
import { NATIVE_INDUSTRY_DEFINITIONS } from '../../shared/workflows.js';

interface FormValues {
  industry: NativeIndustry;
  productName?: string;
  brief: string;
  referenceVideoPath?: string;
  referenceImagePaths?: string[];
  referenceAudioPath?: string;
  variantCount: number;
  durationSec: number;
  ratio: NativeRatio;
  resolution: VideoResolution;
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
  const [selectedReferenceVideoPath, setSelectedReferenceVideoPath] = useState<string>();
  const [selectedReferenceImagePaths, setSelectedReferenceImagePaths] = useState<string[]>([]);
  const [selectedReferenceAudioPath, setSelectedReferenceAudioPath] = useState<string>();
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
      setSelectedReferenceVideoPath(path);
    }
  }

  async function pickReferenceImages() {
    const paths = await api.asset.pickFiles({
      filters: [
        {
          name: 'Image',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tiff', 'tif', 'heic', 'heif'],
        },
      ],
      multi: true,
    });
    if (paths.length > 0) {
      form.setFieldValue('referenceImagePaths', paths);
      setSelectedReferenceImagePaths(paths);
    }
  }

  async function pickReferenceAudio() {
    const [path] = await api.asset.pickFiles({
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3'] }],
    });
    if (path) {
      form.setFieldValue('referenceAudioPath', path);
      setSelectedReferenceAudioPath(path);
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
        ...(values.referenceImagePaths && values.referenceImagePaths.length > 0
          ? { referenceImagePaths: values.referenceImagePaths }
          : {}),
        ...(values.referenceAudioPath ? { referenceAudioPath: values.referenceAudioPath } : {}),
        variantCount: values.variantCount,
        durationSec: values.durationSec,
        ratio: values.ratio,
        resolution: values.resolution,
      },
    });
    form.resetFields();
    setSelectedReferenceVideoPath(undefined);
    setSelectedReferenceImagePaths([]);
    setSelectedReferenceAudioPath(undefined);
    void message.success('任务已入队');
  }

  return (
    <section className="section page-panel">
      <div className="form-shell wide">
        <div className="form-header">
          <div>
            <Typography.Title level={4}>创建原生素材</Typography.Title>
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
            resolution: DEFAULT_VIDEO_RESOLUTION,
          }}
          onFinish={(values) => void submit(values)}
        >
          <Form.Item name="referenceVideoPath" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="referenceImagePaths" hidden>
            <Select mode="multiple" options={[]} />
          </Form.Item>
          <Form.Item name="referenceAudioPath" hidden>
            <Input />
          </Form.Item>
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
              <InputNumber min={bounds.min} max={bounds.max} suffix="秒" className="number-input" />
            </Form.Item>
          </div>
          <Form.Item name="ratio" label="视频比例" rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid" options={RATIO_OPTIONS} />
          </Form.Item>
          <Form.Item name="resolution" label="生成分辨率" rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid" options={VIDEO_RESOLUTION_OPTIONS} />
          </Form.Item>
          <Form.Item label="参考视频">
            <Space.Compact className="full-width">
              <Input
                readOnly
                placeholder="可选，用于保持画面风格或产品上下文"
                value={selectedReferenceVideoPath}
              />
              <Button
                type="default"
                className="file-picker-button"
                icon={<FolderOpenOutlined />}
                aria-label="选择参考视频"
                onClick={() => void pickReferenceVideo()}
              />
            </Space.Compact>
            <SelectedAssetList
              label="已选择参考视频"
              paths={selectedReferenceVideoPath ? [selectedReferenceVideoPath] : []}
            />
          </Form.Item>
          <Form.Item label="参考图片">
            <Space.Compact className="full-width">
              <Input
                readOnly
                placeholder="可选，最多 9 张，用于稳定人物、商品、场景或风格锚点"
                value={
                  selectedReferenceImagePaths.length > 0
                    ? `已选择 ${selectedReferenceImagePaths.length} 张图片`
                    : undefined
                }
              />
              <Button
                type="default"
                className="file-picker-button"
                icon={<FolderOpenOutlined />}
                aria-label="选择参考图片"
                onClick={() => void pickReferenceImages()}
              />
            </Space.Compact>
            <SelectedAssetList label="已选择参考图片" paths={selectedReferenceImagePaths} />
          </Form.Item>
          <Form.Item label="参考音频">
            <Space.Compact className="full-width">
              <Input
                readOnly
                placeholder="可选，用于提示节奏、氛围或口播风格"
                value={selectedReferenceAudioPath}
              />
              <Button
                type="default"
                className="file-picker-button"
                icon={<FolderOpenOutlined />}
                aria-label="选择参考音频"
                onClick={() => void pickReferenceAudio()}
              />
            </Space.Compact>
            <SelectedAssetList
              label="已选择参考音频"
              paths={selectedReferenceAudioPath ? [selectedReferenceAudioPath] : []}
            />
          </Form.Item>
          <Form.Item name="brief" label="广告文案脚本" rules={[{ required: true, min: 10 }]}>
            <Input.TextArea
              rows={7}
              placeholder="输入广告文案脚本，可包含产品卖点、目标人群、口播内容、禁用表达和投放场景。"
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
            创建原生任务
          </Button>
        </Form>
      </div>
    </section>
  );
}
