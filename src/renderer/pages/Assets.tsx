import { Button, Empty, Table, Tag, Typography } from 'antd';
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
    <section className="section page-panel">
      <div className="section-heading">
        <Typography.Title level={4}>本地产物</Typography.Title>
      </div>
      <Table<AssetRecord>
        rowKey="id"
        className="desktop-table"
        size="small"
        dataSource={assets}
        scroll={{ x: 760 }}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无产物" />,
        }}
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
              <Button
                className="icon-button secondary-button"
                icon={<FolderOpenOutlined />}
                onClick={() => void reveal(record.path)}
              />
            ),
          },
        ]}
      />
    </section>
  );
}
