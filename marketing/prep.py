from PIL import Image, ImageDraw, ImageFont
M='/sessions/practical-upbeat-clarke/mnt/washio-app/marketing/'
def prep(src,out,Htarget=2875,band=170):
    im=Image.open(M+src).convert('RGB'); W=im.width
    top=im.getpixel((W//2,5)); botc=im.getpixel((W//2,im.height-5))
    c=Image.new('RGB',(W,Htarget),top); c.paste(im,(0,band))
    d=ImageDraw.Draw(c)
    if band+im.height<Htarget: d.rectangle((0,band+im.height,W,Htarget),fill=botc)
    f=ImageFont.truetype('/usr/share/fonts/truetype/lato/Lato-Bold.ttf',62)
    d.text((175,62),'9:41',font=f,fill='black')
    d.rounded_rectangle((W//2-200,40,W//2+200,154),radius=57,fill='black')
    x=W-360
    for i,h in enumerate([20,30,40,52]): d.rounded_rectangle((x+i*22,120-h,x+14+i*22,120),radius=3,fill='black')
    cx,cy=W-215,112
    for r in (44,30,16): d.arc((cx-r,cy-r,cx+r,cy+r),start=225,end=315,fill='black',width=10)
    bx=W-165
    d.rounded_rectangle((bx,78,bx+78,116),radius=11,outline='black',width=4); d.rounded_rectangle((bx+7,85,bx+71,109),radius=6,fill='black')
    c.save(out)
prep('IMG_1047 2.jpg','/tmp/wa/home_real.png')
prep('IMG_1048 2.jpg','/tmp/wa/conf_real.png')
