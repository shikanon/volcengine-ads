import { useState } from 'react';
import { Button, Form, Input, InputNumber, Radio, Space, Typography, message } from 'antd';
import { FolderOpenOutlined, PictureOutlined } from '@ant-design/icons';

import { SelectedAssetList } from '../components/SelectedAssetList.js';
import { api } from '../ipc.js';
import { useTasksStore } from '../stores/tasks-store.js';
import {
  ECOMMERCE_IMAGE_STYLE_DEFINITIONS,
  type EcommerceImageStyle,
} from '../../shared/types.js';

const DEFAULT_STYLE_DEFINITION = ECOMMERCE_IMAGE_STYLE_DEFINITIONS.find(
  (definition) => definition.value === 'promotion',
) ?? {
  value: 'promotion' as const,
  label: '促销转化',
  description: '强化卖点短语、权益感和行动刺激，适合信息流转化。',
};

interface FormValues {
  productImagePath: string;
  productName?: string;
  sellingPoints?: string;
  fixedCopy?: string;
  scenePrompt?: string;
  variantCount: number;
  style: EcommerceImageStyle;
}

export function EcommerceImage() {
  const [form] = Form.useForm<FormValues>();
  const [selectedProductImagePath, setSelectedProductImagePath] = useState<string>();
  const createTask = useTasksStore((state) => state.createTask);
  const style = Form.useWatch('style', form) ?? 'promotion';
  const variantCount = Form.useWatch('variantCount', form) ?? 3;
  const styleDefinition =
    ECOMMERCE_IMAGE_STYLE_DEFINITIONS.find((definition) => definition.value === style) ??
    DEFAULT_STYLE_DEFINITION;
  const imageModelCallCount = 1 + variantCount + variantCount;

  async function pickProductImage() {
    const [path] = await api.asset.pickFiles({
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
    });
    if (path) {
      form.setFieldValue('productImagePath', path);
      setSelectedProductImagePath(path);
    }
  }

  async function submit(values: FormValues) {
    await createTask({
      type: 'ecommerce_image',
      input: {
        productImagePath: values.productImagePath,
        ...(values.productName ? { productName: values.productName } : {}),
        ...(values.sellingPoints ? { sellingPoints: values.sellingPoints } : {}),
        ...(values.fixedCopy ? { fixedCopy: values.fixedCopy } : {}),
        ...(values.scenePrompt ? { scenePrompt: values.scenePrompt } : {}),
        variantCount: values.variantCount,
        style: values.style,
      },
    });
    form.resetFields();
    setSelectedProductImagePath(undefined);
    void message.success('电商图片包装任务已入队');
  }

  return (
    <section className="section page-panel">
      <div className="form-shell wide">
        <div className="form-header">
          <div>
            <Typography.Title level={4}>创建电商图片包装</Typography.Title>
            <span>商品图理解、主图美化、背景替换和智能文案渲染</span>
          </div>
          <div className="native-strategy">
            <strong>{styleDefinition.label}</strong>
            <span>{styleDefinition.description}</span>
          </div>
        </div>
        <Form<FormValues>
          form={form}
          className="desktop-form native-form"
          layout="vertical"
          initialValues={{
            variantCount: 3,
            style: 'promotion',
          }}
          onFinish={(values) => void submit(values)}
        >
          <div className="native-strategy">
            <strong>预计图片模型调用：1 + N + N = {imageModelCallCount} 次</strong>
            <span>
              N 为生成数量，当前 N={variantCount}。流程会先美化主图 1 次，再生成 {variantCount}{' '}
              张背景变体，并为每张背景渲染一张最终包装图。
            </span>
            <span>
              产物包括 beautified.png、background_variant_i.png、final_i.png、copy.md、
              render_plan.json 与 finals.json，图片会按中间图和最终图登记到素材库。
            </span>
          </div>
          <Form.Item name="productImagePath" hidden rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="商品主图" required>
            <Space.Compact className="full-width">
              <Input readOnly placeholder="选择本地商品主图" value={selectedProductImagePath} />
              <Button
                type="default"
                className="file-picker-button"
                icon={<FolderOpenOutlined />}
                aria-label="选择商品主图"
                onClick={() => void pickProductImage()}
              />
            </Space.Compact>
            <SelectedAssetList
              label="已选择商品主图"
              paths={selectedProductImagePath ? [selectedProductImagePath] : []}
            />
          </Form.Item>
          <div className="native-form-grid">
            <Form.Item name="productName" label="产品名称">
              <Input placeholder="可选，用于商品理解和文案聚焦" maxLength={100} />
            </Form.Item>
            <Form.Item name="variantCount" label="生成数量" rules={[{ required: true }]}>
              <InputNumber min={1} max={5} className="number-input" />
            </Form.Item>
          </div>
          <Form.Item name="style" label="包装风格" rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={ECOMMERCE_IMAGE_STYLE_DEFINITIONS.map((definition) => ({
                value: definition.value,
                label: definition.label,
              }))}
            />
          </Form.Item>
          <Form.Item name="fixedCopy" label="固定套路文案">
            <Input placeholder="可选，例如：快来抖音购物 / 限时好物推荐" maxLength={120} showCount />
          </Form.Item>
          <Form.Item name="scenePrompt" label="背景场景">
            <Input placeholder="可选，例如：清晨浴室台面、户外露营桌面、节日促销氛围" maxLength={500} />
          </Form.Item>
          <Form.Item name="sellingPoints" label="商品卖点与限制">
            <Input.TextArea
              rows={6}
              placeholder="可填写核心卖点、目标人群、价格/功效禁用表达、需要保留的包装信息等。"
              showCount
              maxLength={1000}
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            icon={<PictureOutlined />}
            className="primary-action"
          >
            生成包装图片
          </Button>
        </Form>
      </div>
    </section>
  );
}
