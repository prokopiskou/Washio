import sys
HOME=sys.argv[1] if len(sys.argv)>1 else '/sessions/practical-upbeat-clarke/mnt/washio-app/public/mockup_home.webp'
CONF=sys.argv[2] if len(sys.argv)>2 else '/tmp/wa/confirmed.png'
OUT=sys.argv[3] if len(sys.argv)>3 else '/tmp/wa/slide.png'
from PIL import Image, ImageDraw, ImageFont, ImageFilter
L='/usr/share/fonts/truetype/lato/Lato-'
def F(w,s): return ImageFont.truetype(L+w+'.ttf', s)
W,H=1080,1350
# background gradient
bg=Image.new('RGB',(W,H))
top=(248,250,252); bot=(226,238,247)
for y in range(H):
    t=y/H; c=tuple(int(top[i]+(bot[i]-top[i])*t) for i in range(3))
    ImageDraw.Draw(bg).line([(0,y),(W,y)],fill=c)
# glow
glow=Image.new('RGBA',(W,H),(0,0,0,0)); gd=ImageDraw.Draw(glow)
gd.ellipse((140,520,940,1260),fill=(120,185,225,110))
glow=glow.filter(ImageFilter.GaussianBlur(120))
bg=Image.alpha_composite(bg.convert('RGBA'),glow)
d=ImageDraw.Draw(bg)
INK=(17,24,39); BLUE=(23,128,170)
def ctext(y,t,f,fill):
    w=d.textlength(t,font=f); d.text(((W-w)/2,y),t,font=f,fill=fill); return w
lg=Image.open('/sessions/practical-upbeat-clarke/mnt/washio-app/public/washio-logo.png').convert('RGBA')
lg=lg.crop(lg.getbbox()); lw=340; lg=lg.resize((lw,int(lw*lg.height/lg.width)),Image.LANCZOS)
bg.alpha_composite(lg,((W-lw)//2,24))
ctext(282,'Το Washio',F('Black',60),INK)
ctext(350,'για να κλείσει εύκολα και γρήγορα',F('Semibold',44),(55,65,81))
ctext(402,'το πλύσιμο του αυτοκινήτου της.',F('Semibold',44),(55,65,81))
ctext(462,'Χωρίς αναμονές.',F('Black',48),BLUE)

def phone(path,w):
    scr=Image.open(path).convert('RGB')
    h=int(w*scr.height/scr.width)
    scr=scr.resize((w,h),Image.LANCZOS)
    bez=14; R=int(w*0.135)
    P=Image.new('RGBA',(w+2*bez,h+2*bez),(0,0,0,0))
    pd=ImageDraw.Draw(P)
    pd.rounded_rectangle((0,0,w+2*bez-1,h+2*bez-1),radius=R+bez,fill=(18,18,20))
    pd.rounded_rectangle((3,3,w+2*bez-4,h+2*bez-4),radius=R+bez-3,outline=(70,70,75),width=2)
    m=Image.new('L',(w,h),0); ImageDraw.Draw(m).rounded_rectangle((0,0,w-1,h-1),radius=R,fill=255)
    P.paste(scr,(bez,bez),m)
    return P
def place(base,P,cx,cy,ang):
    Pr=P.rotate(ang,resample=Image.BICUBIC,expand=True)
    # shadow
    pad=120
    a=Image.new('L',(Pr.width+2*pad,Pr.height+2*pad),0); a.paste(Pr.split()[3],(pad,pad))
    sh=Image.new('RGBA',a.size,(10,25,45,0)); sh.putalpha(a.point(lambda v:int(v*0.38)).filter(ImageFilter.GaussianBlur(30)))
    x=int(cx-Pr.width/2); y=int(cy-Pr.height/2)
    base.alpha_composite(sh,(x+18-pad,y+34-pad))
    base.alpha_composite(Pr,(x,y))
pw=320
A=phone(HOME,pw)
B=phone(CONF,pw)
place(bg,A,392,898,6)
place(bg,B,688,914,-6)
d=ImageDraw.Draw(bg)
ctext(1296,'washio.gr',F('Bold',32),(75,85,99))
bg.convert('RGB').save(OUT,quality=95)
