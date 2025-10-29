export interface SegmentRow {
  id: string;
  title?: string;
  duration?: number;
  text?: string;
}

interface SegmentTableProps {
  segments: SegmentRow[];
}

export default function SegmentTable({ segments }: SegmentTableProps) {
  if (!segments.length) {
    return null;
  }

  return (
    <table className="segment-table">
      <thead>
        <tr>
          <th>Segment ID</th>
          <th>Title</th>
          <th>Duration (s)</th>
        </tr>
      </thead>
      <tbody>
        {segments.map((segment) => (
          <tr key={segment.id}>
            <td>{segment.id}</td>
            <td>{segment.title ?? '—'}</td>
            <td>{segment.duration?.toFixed(2) ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
