import { Alert, Button, Form, Input, InputNumber, Radio, Space, Switch, Tag, Typography, message } from 'antd';
import { FolderOpenOutlined, ThunderboltOutlined } from '@ant-design/icons';

import { SelectedAssetList } from '../components/SelectedAssetList.js';
import { api } from '../ipc.js';
import { useTasksStore } from '../stores/tasks-store.js';
import {
  DEFAULT_VIDEO_RESOLUTION,
  VIDEO_RESOLUTION_OPTIONS,
  type ExplosionFissionConfig,
  type ExplosionFissionMode,
  type ExplosionInput,
  type FissionIndustry,
  type FissionSlotKey,
  type VideoResolution,
} from '../../shared/types.js';
import {
  FISSION_MODE_OPTIONS,
  estimateFissionCombinations,
  getFissionModeDefinition,
  validateFissionCombinationInputs,
  type FissionSlotAssetKind,
} from '../../shared/workflows.js';

type SourceMode = 'douyin' | 'local';

interface FormValues {
  sourceMode: SourceMode;
  douyinUrl?: string;
  sourceVideoPath?: string;
  variantCount: number;
  resolution: VideoResolution;
  enableFission: boolean;
  fissionIndustry: FissionIndustry;
  fissionMode: ExplosionFissionMode;
  slotAssetPaths?: Partial<Record<FissionSlotKey, string[]>>;
  bgmPaths?: string[];
}

const FISSION_INDUSTRY_LABELS: Record<FissionIndustry, string> = {
  ecommerce: '电商',
  short_drama: '短剧',
};

const DEFAULT_FISSION_INDUSTRY: FissionIndustry = 'ecommerce';
const DEFAULT_FISSION_MODE: ExplosionFissionMode = 'pain_pretrailer';

function defaultModeForIndustry(industry: FissionIndustry): ExplosionFissionMode {
  return FISSION_MODE_OPTIONS[industry][0]?.mode ?? DEFAULT_FISSION_MODE;
}

function compactSlotAssetPaths(
  mode: ExplosionFissionMode,
  slotAssetPaths: Partial<Record<FissionSlotKey, string[]>> | undefined,
): ExplosionFissionConfig['slotAssetPaths'] {
  const definition = Object.values(FISSION_MODE_OPTIONS)
    .flat()
    .find((item) => item.mode === mode);
  const entries =
    definition?.slots
      .filter((slot) => slot.key !== 'bgm')
      .map((slot) => {
        const paths = slotAssetPaths?.[slot.key]?.filter((path) => path.trim().length > 0) ?? [];
        return [slot.key, paths] as const;
      })
      .filter(([, paths]) => paths.length > 0) ?? [];
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries) as ExplosionFissionConfig['slotAssetPaths'];
}

function buildFissionConfig(values: FormValues): ExplosionFissionConfig | undefined {
  if (!values.enableFission) {
    return undefined;
  }
  const config: ExplosionFissionConfig = {
    industry: values.fissionIndustry,
    mode: values.fissionMode,
  };
  const slotAssetPaths = compactSlotAssetPaths(values.fissionMode, values.slotAssetPaths);
  const bgmPaths = values.bgmPaths?.filter((path) => path.trim().length > 0) ?? [];
  if (slotAssetPaths !== undefined) {
    config.slotAssetPaths = slotAssetPaths;
  }
  if (bgmPaths.length > 0) {
    config.bgmPaths = bgmPaths;
  }
  return config;
}

export function Explosion() {
  const [form] = Form.useForm<FormValues>();
  const sourceMode = Form.useWatch('sourceMode', form) ?? 'douyin';
  const sourceVideoPath = Form.useWatch('sourceVideoPath', form);
  const enableFission = Form.useWatch('enableFission', form) ?? false;
  const fissionIndustry = Form.useWatch('fissionIndustry', form) ?? DEFAULT_FISSION_INDUSTRY;
  const fissionMode = Form.useWatch('fissionMode', form) ?? defaultModeForIndustry(fissionIndustry);
  const variantCount = Form.useWatch('variantCount', form) ?? 3;
  const slotAssetPaths = Form.useWatch('slotAssetPaths', form) ?? {};
  const bgmPaths = Form.useWatch('bgmPaths', form) ?? [];
  const createTask = useTasksStore((state) => state.createTask);
  const selectedModeDefinition = getFissionModeDefinition(fissionIndustry, fissionMode);
  const slotCounts = selectedModeDefinition
    ? (Object.fromEntries(
        selectedModeDefinition.slots.map((slot) => [
          slot.key,
          slot.key === 'bgm' ? bgmPaths.length : (slotAssetPaths[slot.key]?.length ?? 0),
        ]),
      ) as Partial<Record<FissionSlotKey, number>>)
    : {};
  const combinationEstimate = selectedModeDefinition
    ? estimateFissionCombinations(fissionIndustry, fissionMode, slotCounts, variantCount)
    : undefined;

  async function pickVideo() {
    const [path] = await api.asset.pickFiles({
      filters: [{ name: 'Video', extensions: ['mp4', 'mov'] }],
    });
    if (path) {
      form.setFieldValue('sourceVideoPath', path);
    }
  }

  async function pickSlotAssets(slotKey: FissionSlotKey, assetKind: FissionSlotAssetKind) {
    const paths = await api.asset.pickFiles({
      filters:
        assetKind === 'audio'
          ? [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac'] }]
          : [{ name: 'Video', extensions: ['mp4', 'mov'] }],
      multi: true,
    });
    if (paths.length === 0) {
      return;
    }
    if (slotKey === 'bgm') {
      form.setFieldValue('bgmPaths', paths);
      return;
    }
    form.setFieldValue(['slotAssetPaths', slotKey], paths);
  }

  function clearSlotAssets(slotKey: FissionSlotKey) {
    if (slotKey === 'bgm') {
      form.setFieldValue('bgmPaths', []);
      return;
    }
    form.setFieldValue(['slotAssetPaths', slotKey], []);
  }

  function changeFissionIndustry(industry: FissionIndustry) {
    form.setFieldsValue({
      fissionIndustry: industry,
      fissionMode: defaultModeForIndustry(industry),
      slotAssetPaths: {},
      bgmPaths: [],
    });
  }

  async function submit(values: FormValues) {
    const baseInput: ExplosionInput | undefined =
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
    if (!baseInput) {
      void message.error('请选择或填写爆款素材');
      return;
    }
    const fissionConfig = buildFissionConfig(values);
    if (fissionConfig) {
      const result = validateFissionCombinationInputs(fissionConfig, values.variantCount);
      if (!result.valid) {
        void message.error(result.errors.join('；'));
        return;
      }
    }
    const input: ExplosionInput = fissionConfig ? { ...baseInput, fissionConfig } : baseInput;
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
            enableFission: false,
            fissionIndustry: DEFAULT_FISSION_INDUSTRY,
            fissionMode: DEFAULT_FISSION_MODE,
            slotAssetPaths: {},
            bgmPaths: [],
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
          <Form.Item
            name="enableFission"
            label="高级行业裂变配置"
            valuePropName="checked"
            extra="默认关闭，保持原爆款裂变表单与 pipeline 行为不变。开启后会提交行业、模式、槽位素材和 BGM 配置。"
          >
            <Switch checkedChildren="已开启" unCheckedChildren="关闭" />
          </Form.Item>
          {enableFission ? (
            <div className="fission-config-panel">
              <Form.Item name="fissionIndustry" label="裂变行业" rules={[{ required: true }]}>
                <Radio.Group
                  optionType="button"
                  buttonStyle="solid"
                  options={Object.entries(FISSION_INDUSTRY_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                  onChange={(event) => changeFissionIndustry(event.target.value as FissionIndustry)}
                />
              </Form.Item>
              <Form.Item name="fissionMode" label="裂变模式" rules={[{ required: true }]}>
                <Radio.Group
                  className="fission-mode-grid"
                  options={FISSION_MODE_OPTIONS[fissionIndustry].map((definition) => ({
                    value: definition.mode,
                    label: (
                      <span className="fission-mode-option">
                        <strong>{definition.title}</strong>
                        <span>{definition.description}</span>
                      </span>
                    ),
                  }))}
                  onChange={() =>
                    form.setFieldsValue({
                      slotAssetPaths: {},
                      bgmPaths: [],
                    })
                  }
                />
              </Form.Item>
              {selectedModeDefinition ? (
                <>
                  <Alert
                    className="fission-estimate"
                    type="info"
                    showIcon
                    message={`${selectedModeDefinition.title}：${selectedModeDefinition.formula}`}
                    description={
                      <div className="fission-estimate-body">
                        <div>
                          {combinationEstimate?.factors.map((factor) => (
                            <Tag key={factor.slotKey} className="copywriting-mode-tag">
                              {factor.label} × {factor.count}
                            </Tag>
                          ))}
                        </div>
                        <strong>组合估算：{combinationEstimate?.formula ?? '0 = 0'}</strong>
                        <span>
                          本次最多抽样生成 {combinationEstimate?.sampleCount ?? 0} 条，目标裂变数量为 {variantCount} 条。
                        </span>
                      </div>
                    }
                  />
                  <div className="fission-slot-grid">
                    {selectedModeDefinition.slots.map((slot) => {
                      const paths = slot.key === 'bgm' ? bgmPaths : (slotAssetPaths[slot.key] ?? []);
                      return (
                        <Form.Item
                          key={slot.key}
                          label={slot.label}
                          required={slot.required}
                          rules={[
                            {
                              validator: () =>
                                paths.length > 0
                                  ? Promise.resolve()
                                  : Promise.reject(new Error(`请选择${slot.label}`)),
                            },
                          ]}
                        >
                          <Space.Compact className="full-width">
                            <Input
                              readOnly
                              value={paths.length > 0 ? `已选择 ${paths.length} 个素材` : undefined}
                              placeholder={slot.description}
                            />
                            <Button
                              type="default"
                              className="file-picker-button"
                              icon={<FolderOpenOutlined />}
                              aria-label={`选择${slot.label}`}
                              onClick={() => void pickSlotAssets(slot.key, slot.assetKind)}
                            />
                            <Button type="default" onClick={() => clearSlotAssets(slot.key)}>
                              清空
                            </Button>
                          </Space.Compact>
                          <SelectedAssetList label={`已选择${slot.label}`} paths={paths} />
                        </Form.Item>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
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
