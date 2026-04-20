#!/bin/bash
set -e

echo "Generating final video with corrected colors + enhanced audio..."

# Brand Colors (adjusted for video rendering - shifted cooler to appear as #C5A059 on screen)
GOLD="0xB89845"
GOLD_LIGHT="0xD4B46A"
BG="0x0f1115"
TEXT_PRIMARY="0xE2E8F0"
TEXT_SECONDARY="0x8A9AB0"

# Step 1: Measure loudness for two-pass normalization
echo "Pass 1: Measuring loudness..."
LOUDNORM_STATS=$(ffmpeg -i public/alexvideo_h264.mp4 -af "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | grep -A 20 '"input_i"' | head -20)

INPUT_I=$(echo "$LOUDNORM_STATS" | grep '"input_i"' | sed 's/[^0-9.-]//g')
INPUT_TP=$(echo "$LOUDNORM_STATS" | grep '"input_tp"' | sed 's/[^0-9.-]//g')
INPUT_LRA=$(echo "$LOUDNORM_STATS" | grep '"input_lra"' | sed 's/[^0-9.-]//g')
INPUT_THRESH=$(echo "$LOUDNORM_STATS" | grep '"input_thresh"' | sed 's/[^0-9.-]//g')

echo "Measured: I=$INPUT_I TP=$INPUT_TP LRA=$INPUT_LRA Thresh=$INPUT_THRESH"

# Step 2: Render with video filters + two-pass loudnorm
echo "Pass 2: Rendering final video..."
ffmpeg -y -i public/alexvideo_h264.mp4 -vf "
  colorspace=all=bt709:iall=bt2020:fast=1,
  format=yuv420p,

  drawbox=x=0:y=0:w=1080:h=1920:color=${BG}:t=fill:enable='gte(t,94)',
  
  drawbox=x=0:y=0:w=1080:h=1920:color=${BG}@0.6:t=fill:enable='between(t,0,3)',
  drawtext=text='JEGODIGITAL':fontcolor=${GOLD}:fontsize=120:x=(w-text_w)/2:y=(h-text_h)/2-100:enable='between(t,0,3)',
  drawtext=text='AI-Powered Growth for Real Estate Pros':fontcolor=${TEXT_SECONDARY}:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2+50:enable='between(t,0,3)',

  drawbox=x=100:y=1450:w=800:h=250:color=${BG}@0.9:t=fill:enable='between(t,2,9)',
  drawbox=x=100:y=1450:w=10:h=250:color=${GOLD}:t=fill:enable='between(t,2,9)',
  drawtext=text='Alex':fontcolor=${TEXT_PRIMARY}:fontsize=70:x=150:y=1500:enable='between(t,2,9)',
  drawtext=text='FOUNDER, JEGODIGITAL':fontcolor=${GOLD}:fontsize=36:x=150:y=1610:enable='between(t,2,9)',

  drawtext=text='JEGODIGITAL':fontcolor=${GOLD_LIGHT}:fontsize=150:x=(w-text_w)/2:y=(h-text_h)/2-150:enable='gte(t,94)',
  drawtext=text='Book a Call ->':fontcolor=${BG}:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2+175:box=1:boxcolor=${GOLD}:boxborderw=30:enable='gte(t,94)'
" \
-af "highpass=f=80,lowpass=f=12000,afftdn=nf=-25:nr=15:nt=w,acompressor=threshold=-20dB:ratio=3:attack=5:release=50,loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${INPUT_I}:measured_TP=${INPUT_TP}:measured_LRA=${INPUT_LRA}:measured_thresh=${INPUT_THRESH}:linear=true" \
-color_primaries bt709 -color_trc bt709 -colorspace bt709 \
-c:v libx264 -preset fast -crf 18 -c:a aac -ar 48000 -b:a 192k alexwelcome_final.mp4

echo "Success! Video saved to $(pwd)/alexwelcome_final.mp4"
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 alexwelcome_final.mp4)
echo "Duration: ${DURATION}s"
