"""Render completely synthetic P19 control poses into a stylized technical MP4.
The 480 frames are vector drawings rendered independently from 480 generated pose states.
No person image, private training data, voice clone, real facial landmark or neural video generation.
"""
from __future__ import annotations
import json, math, subprocess, wave
from pathlib import Path
import cv2
import numpy as np

W=720; H=720
S=(242,237,229); INK=(35,37,42); MUTED=(114,106,96); ACC=(35,111,142)
NAVY=(49,42,37); SKIN=(175,205,225); HAIR=(42,39,40); LIP=(96,114,156)


def xy(p):return (int(round(p[0]*W)),int(round(p[1]*H)))
def txt(im,s,pos,scale=.55,color=INK,th=1):
    cv2.putText(im,s,pos,cv2.FONT_HERSHEY_SIMPLEX,scale,color,th,cv2.LINE_AA)

def draw(f,idx,total):
    im=np.full((H,W,3),S,dtype=np.uint8)
    cv2.rectangle(im,(20,15),(700,705),(207,202,194),1)
    # Ambient window, editorial composition
    cv2.rectangle(im,(510,92),(679,508),(221,219,214),-1)
    cv2.line(im,(590,92),(590,508),(211,208,203),3)
    cv2.line(im,(510,270),(679,270),(211,208,203),3)
    txt(im,'RETOUCHE   /   CINEMA MOTION LAB',(43,52),.65,INK,2)
    txt(im,'P19   -   PROTOTYPE CINEMATIQUE',(45,83),.40,MUTED,1)
    # torso, neck, hair: stylized fictional adult; NOT portrait/identity
    sb=f['shoulder_breath']
    torsoTop=int(454-sb*160)
    cv2.ellipse(im,(365,554),(165,116),0,179,360,NAVY,-1,cv2.LINE_AA)
    cv2.rectangle(im,(282,torsoTop),(444,600),NAVY,-1)
    cv2.ellipse(im,(365,torsoTop+18),(152,70),0,185,355,NAVY,-1,cv2.LINE_AA)
    cv2.rectangle(im,(336,357),(390,465),SKIN,-1)
    # Hair around head, then face with eyes, brows, cheeks
    cv2.ellipse(im,(362,251),(124,174),0,0,360,HAIR,-1,cv2.LINE_AA)
    cv2.ellipse(im,(360,257),(102,139),0,0,360,SKIN,-1,cv2.LINE_AA)
    cv2.ellipse(im,(361,165),(108,82),0,180,359,HAIR,-1,cv2.LINE_AA)
    cv2.ellipse(im,(271,285),(21,103),-7,0,360,HAIR,-1,cv2.LINE_AA)
    cv2.ellipse(im,(454,288),(22,108),7,0,360,HAIR,-1,cv2.LINE_AA)
    for i,baseX in enumerate((329,398)):
        brow=int(1.5*f['brow_micro_raise']*100)
        cv2.ellipse(im,(baseX,219-brow),(26,7),0,187,352,(75,78,89),2,cv2.LINE_AA)
        lid=max(.3,1-f['eyelid_closure'])
        cv2.ellipse(im,(baseX,236),(24,max(1,int(10*lid))),0,0,360,(251,250,246),-1,cv2.LINE_AA)
        px=baseX+int((f['gaze_xy'][0]-.5)*900)
        cv2.circle(im,(px,236),(min(8,round(8*lid))),INK,-1,cv2.LINE_AA)
        cv2.circle(im,(px-2,234),2,(239,240,239),-1,cv2.LINE_AA)
    # Nose and cheeks: explicit subtle independent control, not faithful physiology
    cv2.line(im,(360,245),(354,276),(134,152,178),2,cv2.LINE_AA)
    cv2.ellipse(im,(349,278),(9,3),0,0,180,(129,143,163),1,cv2.LINE_AA)
    v=f['cheek_draw']
    shade=int(max(0,min(35,v*900)))
    cv2.ellipse(im,(300,297),(24,10-shade//12),8,0,360,(172-shade//5,181-shade//5,196),1,cv2.LINE_AA)
    cv2.ellipse(im,(417,297),(24,10-shade//12),-8,0,360,(172-shade//5,181-shade//5,196),1,cv2.LINE_AA)
    # Mouth lips synced with filter contact and inhalation controls
    m=xy(f['mouth_xy'])
    lipHeight=max(2,int(f['lip_opening']*H*.8));
    cv2.ellipse(im,m,(24,6+lipHeight),0,0,360,LIP,-1,cv2.LINE_AA)
    cv2.ellipse(im,m,(19,max(1,lipHeight)),0,0,360,(81,72,85),-1,cv2.LINE_AA)
    if f['lip_contact']:
        cv2.ellipse(im,(m[0]-2,m[1]),(13,max(1,lipHeight)),0,0,360,(128,129,164),1,cv2.LINE_AA)
    # One connected arm/hand, no teleport: graphic illustration
    h=xy(f['hand_xy']); shoulder=(450,483)
    cv2.line(im,shoulder,(h[0]+2,h[1]+5),NAVY,27,cv2.LINE_AA)
    cv2.circle(im,h,16,SKIN,-1,cv2.LINE_AA)
    filterPoint=xy(f['filter_xy']);
    cv2.line(im,(h[0]-3,h[1]-5),(filterPoint[0]-9,filterPoint[1]+7),SKIN,8,cv2.LINE_AA)
    cv2.line(im,(h[0]+2,h[1]+1),(filterPoint[0]-6,filterPoint[1]+12),SKIN,6,cv2.LINE_AA)
    # Cigarette: filter near the lips, tip is opposite end
    tip=(filterPoint[0]-53,filterPoint[1]+14)
    cv2.line(im,tip,filterPoint,(234,235,232),8,cv2.LINE_AA)
    cv2.line(im,(filterPoint[0]-15,filterPoint[1]+4),filterPoint,(106,158,192),8,cv2.LINE_AA)
    cv2.circle(im,tip,4,(49,99,179) if f['phase']=='inhale' else (90,132,163),-1,cv2.LINE_AA)
    # Mouth-origin particles only after the mouth-smoke start; tip glow handled separately
    for s in f['smoke_particles']:
        cx,cy=xy([s['x'],s['y']]);radius=max(1,int(s['radius']*H))
        alpha=min(.65,max(0,s['opacity']))
        if alpha<=0:continue
        cv2.circle(im,(cx,cy),radius,(188,184,173),1,cv2.LINE_AA)
        if radius>3:cv2.circle(im,(cx+1,cy-3),radius//2,(205,203,196),1,cv2.LINE_AA)
    # Overlays to clarify this is measuring / driving controls, NOT a generated person
    cv2.rectangle(im,(41,585),(679,675),(228,223,213),-1)
    phaseLabels={'approach':'MAIN EN APPROCHE','contact':'CONTACT FILTRE / LEVRES','inhale':'INSPIRATION','release':'RETRAIT DE LA MAIN',
       'pause':'PAUSE','exhale':'EXPIRATION','smoke_drift':'DISPERSION DE LA FUMEE'}
    txt(im,phaseLabels[f['phase']],(59,612),.60,INK,2)
    txt(im,f"{f['t']:05.2f}s   /   08.00s     60 POSES/S     VECTEUR SYNTHETIQUE",(59,639),.40,MUTED)
    barW=596;cv2.rectangle(im,(59,653),(59+barW,660),(203,197,188),-1)
    cv2.rectangle(im,(59,653),(59+int(barW*(idx+1)/total),660),ACC,-1)
    txt(im,'AUCUN VISAGE REEL  -  AUCUN MODELE VIDEO IA', (55,692),.33,MUTED)
    return im

def breath_audio(path, fps=24000, seconds=8, seed=17):
    rng=np.random.default_rng(seed);n=int(fps*seconds);times=np.arange(n)/fps
    noise=rng.standard_normal(n).astype(np.float32)
    # Smoothed hiss for clearly synthetic inhale/exhale, not speech or real person's breathing
    kernel=np.ones(21,dtype=np.float32)/21
    filtered=np.convolve(noise,kernel,mode='same')
    env=np.zeros(n,dtype=np.float32)
    for begin,end,amp in [(1.85,3.5,.10),(5.10,6.85,.18)]:
        mask=(times>=begin)&(times<end)
        x=(times[mask]-begin)/(end-begin)
        env[mask]=amp*np.power(np.sin(np.pi*x),1.2)
    hiss=filtered*env
    # Very quiet room tone; no source audio was used.
    hiss+=(np.sin(2*np.pi*85*times)*.002).astype(np.float32)
    hiss=np.clip(hiss,-1,1)
    pcm=(hiss*32767).astype('<i2')
    with wave.open(str(path),'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(fps);w.writeframes(pcm.tobytes())


def main():
    root=Path(__file__).resolve().parents[1]
    path=root/'results/p19_pose_controls_60hz.json'
    data=json.loads(path.read_text())
    f=data['frames'];fps=data['fps'];assert fps==60 and len(f)==480
    out=root/'public/RetoucheCinema_P19_60poses_par_seconde.mp4'
    tmp=root/'results/p19_video_silent.mp4';audio=root/'results/p19_synthetic_breath.wav'
    cmd=['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','bgr24','-video_size',f'{W}x{H}',
         '-framerate',str(fps),'-i','pipe:0','-an','-c:v','libx264','-preset','ultrafast','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart',str(tmp)]
    process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    try:
        for idx,pose in enumerate(f):
            frame=draw(pose,idx,len(f))
            if idx in (0,96,240,360):cv2.imwrite(str(root/f'public/p19_frame_{idx:03d}.png'),frame)
            process.stdin.write(frame.tobytes())
    finally:
        process.stdin.close()
    if process.wait()!=0:raise RuntimeError('ffmpeg encode failed')
    breath_audio(audio)
    subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(tmp),'-i',str(audio),'-map','0:v:0','-map','1:a:0',
                   '-c:v','copy','-c:a','aac','-b:a','96k','-ac','1','-ar','24000','-t','8','-movflags','+faststart',str(out)],check=True)
    print(out, out.stat().st_size)

if __name__=='__main__':main()
