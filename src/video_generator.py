import subprocess
import sys

def create_video(image_path, audio_path, output_path):
    command = [
        'ffmpeg',
        '-loop', '1',
        '-i', image_path,
        '-i', audio_path,
        '-c:v', 'libx264',
        '-tune', 'stillimage',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-pix_fmt', 'yuv420p',
        '-shortest',
        output_path
    ]

    subprocess.run(command, check=True)

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python video_generator.py <image_path> <audio_path> <output_path>")
        sys.exit(1)

    image_path = sys.argv[1]
    audio_path = sys.argv[2]
    output_path = sys.argv[3]

    try:
        create_video(image_path, audio_path, output_path)
        print("Video created successfully")
    except subprocess.CalledProcessError as e:
        print(f"Error: {e}")
        sys.exit(1)