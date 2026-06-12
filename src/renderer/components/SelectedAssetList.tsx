import { Tag } from 'antd';

function assetName(path: string): string {
  const normalized = path.replace(/\\/gu, '/');
  const segments = normalized.split('/');
  return segments[segments.length - 1] ?? path;
}

interface SelectedAssetListProps {
  label: string;
  paths: string[];
}

export function SelectedAssetList({ label, paths }: SelectedAssetListProps) {
  if (paths.length === 0) {
    return null;
  }

  return (
    <div className="selected-assets-panel">
      <div className="selected-assets-header">
        <span>{label}</span>
        <Tag className="selected-assets-count">已添加 {paths.length}</Tag>
      </div>
      <div className="selected-assets-list">
        {paths.map((path) => (
          <div key={path} className="selected-asset-item" title={path}>
            <strong>{assetName(path)}</strong>
            <span>{path}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
