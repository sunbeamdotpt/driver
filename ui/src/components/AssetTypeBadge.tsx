import { useAssetType } from '../hooks/useAssetType'

interface AssetTypeBadgeProps {
  filename: string
  mimetype?: string
}

export default function AssetTypeBadge({ filename, mimetype }: AssetTypeBadgeProps) {
  const assetType = useAssetType(filename, mimetype)

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
        backgroundColor: assetType.color + '20',
        color: assetType.color,
        whiteSpace: 'nowrap',
      }}
    >
      <span className="material-icons" aria-hidden="true" style={{ fontSize: 14 }}>
        {assetType.icon}
      </span>
      {assetType.category}
    </span>
  )
}
