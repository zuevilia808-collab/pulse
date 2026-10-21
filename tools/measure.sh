#!/usr/bin/env bash
# Замер звука: громкость (LUFS) и уровни по полосам частот для файлов local/renders/<префикс>_*.wav
# Запуск: bash tools/measure.sh loop
cd "$(dirname "$0")/../local/renders" || exit 1
F=../../../data/bin/ffmpeg.exe
rms() { $F -hide_banner -nostats -i "$1" -af "$2astats=metadata=0" -f null - 2>&1 | grep 'RMS level dB' | tail -1 | grep -o '\-*[0-9.]*$' | cut -c1-6; }
side() { $F -hide_banner -nostats -i "$1" -af "pan=mono|c0=0.5*c0-0.5*c1,astats=metadata=0" -f null - 2>&1 | grep 'RMS level dB' | tail -1 | grep -o '\-*[0-9.]*$' | cut -c1-6; }
printf "%-8s %7s %7s %7s %7s %7s %7s %7s %7s\n" файл LUFS всего "<120" 120-500 500-2k 2k-6k ">6k" стерео
for f in "$1"_*.wav; do
  lufs=$($F -hide_banner -nostats -i "$f" -af ebur128 -f null - 2>&1 | grep -A3 Summary | grep -o 'I: *-*[0-9.]*' | grep -o '\-*[0-9.]*$')
  n=${f#"$1"_}; n=${n%.wav}
  printf "%-8s %7s %7s %7s %7s %7s %7s %7s %7s\n" "$n" "$lufs" "$(rms "$f" "")" "$(rms "$f" "lowpass=f=120,")" "$(rms "$f" "highpass=f=120,lowpass=f=500,")" \
    "$(rms "$f" "highpass=f=500,lowpass=f=2000,")" "$(rms "$f" "highpass=f=2000,lowpass=f=6000,")" "$(rms "$f" "highpass=f=6000,")" "$(side "$f")"
done
