import { Button, Table, Tag, Typography } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import { useEffect } from 'react';

import { useAssetsStore } from '../stores/assets-store.js';
import type { AssetRecord } from '../../shared/types.js';

export function Assets() {
  const { assets, loadAssets, reveal } = useAssetsStore();

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  return (
    <section className="section">
      <Typography.Title level={4}>本地产物</Typography.Title>
      <Table<AssetRecord>
        rowKey="id"
        dataSource={assets}
        columns={[
          { title: '类型', dataIndex: 'kind', width: 120 },
          {
            title: '标签',
            dataIndex: 'tags',
            width: 180,
            render: (tags: string[]) => tags.map((tag) => <Tag key={tag}>{tag}</Tag>),
          },
          { title: '路径', dataIndex: 'path', ellipsis: true },
          {
            title: '定位',
            width: 100,
            render: (_, record) => (
              <Button icon={<FolderOpenOutlined />} onClick={() => void reveal(record.path)} />
            ),
          },
        ]}
      />
    </section>
  );
}
