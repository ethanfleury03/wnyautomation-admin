import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 38,
          background: 'linear-gradient(180deg, #10251d 0%, #2f6b4f 100%)',
          color: '#f5f7f3',
          fontSize: 64,
          fontWeight: 800,
          letterSpacing: -4,
        }}
      >
        WA
      </div>
    ),
    size,
  );
}
