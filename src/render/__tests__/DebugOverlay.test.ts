// Unit tests for DebugOverlay

import { LabelGen } from '../LabelGen';
import { buildDebugSafeAndTime } from '../DebugOverlay';

describe('DebugOverlay', () => {
  describe('buildDebugSafeAndTime', () => {
    it('should generate a debug overlay with default options', () => {
      const lb = new LabelGen();
      // Mock process.platform to test Windows behavior consistently
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      const result = buildDebugSafeAndTime(lb, 'video0', 'shot_001', 1920, 1080);

      expect(result.graph).toContain('drawbox=x=96:y=54:w=1728:h=972:color=lime@0.35:t=2');
      expect(result.graph).toContain("drawtext=font='Arial':text='shot_001'");
      expect(result.graph).toContain('text=\'%{pts\\:hms}\'');
      expect(result.graph).toContain('fontsize=28:fontcolor=yellow:borderw=2:bordercolor=black@0.6:x=24:y=24');
      expect(result.graph).toContain('fontsize=28:fontcolor=white:borderw=2:bordercolor=black@0.6:x=w-tw-24:y=24');
      expect(result.graph).not.toContain('drawgrid');
      expect(result.outV).toMatch(/dbg\d+/);
      
      // Restore original platform
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });

    it('should generate a debug overlay with custom options', () => {
      const lb = new LabelGen();
      const result = buildDebugSafeAndTime(lb, 'video0', 'test_shot', 1280, 720, {
        marginPct: 0.1,
        font: 'custom/font.ttf'
      });

      expect(result.graph).toContain('drawbox=x=128:y=72:w=1024:h=576:color=lime@0.35:t=2');
      expect(result.graph).toContain('drawtext=fontfile=\'custom/font.ttf\':text=\'test_shot\'');
      expect(result.outV).toMatch(/dbg\d+/);
    });

    it('should use Arial font on Windows when no font specified', () => {
      const lb = new LabelGen();
      // Mock process.platform to test Windows behavior
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      const result = buildDebugSafeAndTime(lb, 'video0', 'shot_001', 1920, 1080);
      
      expect(result.graph).toContain("drawtext=font='Arial':text='shot_001'");
      
      // Restore original platform
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });

    it('should properly escape text with special characters', () => {
      const lb = new LabelGen();
      // Mock process.platform to test Windows behavior consistently
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      const result = buildDebugSafeAndTime(lb, 'video0', "shot's id: test", 1920, 1080);

      // Should escape single quotes and colons
      expect(result.graph).toContain("text='shot\\\\'s id\\: test'");
      
      // Restore original platform
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });

    it('should include grid when showGrid option is true', () => {
      const lb = new LabelGen();
      // Mock process.platform to test Windows behavior consistently
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      const result = buildDebugSafeAndTime(lb, 'video0', 'shot_001', 1920, 1080, {
        showGrid: true
      });

      expect(result.graph).toContain('drawgrid=width=64:height=64:thickness=1:color=white@0.15');
      
      // Restore original platform
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });
  });
});