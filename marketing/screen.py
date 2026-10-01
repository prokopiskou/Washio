from PIL import Image, ImageDraw, ImageFont
L='/usr/share/fonts/truetype/lato/Lato-'
def F(w,s): return ImageFont.truetype(L+w+'.ttf', s)
MONO=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', 78)
W,H=1206,2622
im=Image.new('RGB',(W,H),'white'); d=ImageDraw.Draw(im)
G9=(17,24,39)
def ctext(y,t,f,fill):
    w=d.textlength(t,font=f); d.text(((W-w)/2,y),t,font=f,fill=fill)
def spaced(x,y,t,f,fill,sp=4):
    for ch in t:
        d.text((x,y),ch,font=f,fill=fill); x+=d.textlength(ch,font=f)+sp
    return x
def spaced_w(t,f,sp=4): return sum(d.textlength(c,font=f)+sp for c in t)-sp
# status bar
d.text((128,48),'9:41',font=F('Bold',58),fill='black')
d.rounded_rectangle((418,34,788,142),radius=54,fill='black')
# signal bars
for i,h in enumerate([18,28,38,48]): d.rounded_rectangle((865+i*20,108-h,878+i*20,108),radius=3,fill='black')
# wifi
for r in (40,27,14):
    d.arc((985-r,100-r,985+r,100+r),start=225,end=315,fill='black',width=9)
d.rounded_rectangle((1040,70,1110,104),radius=10,outline='black',width=4); d.rounded_rectangle((1047,77,1103,97),radius=6,fill='black'); d.rounded_rectangle((1113,80,1119,94),radius=2,fill='black')
# check badge
cx=W//2; cy=370; r=96
sh=Image.new('RGBA',(W,H),(0,0,0,0))
d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=G9)
d.line([(cx-42,cy+2),(cx-12,cy+34),(cx+44,cy-30)],fill='white',width=16,joint='curve')
ctext(520,'Η κράτησή σου',F('Bold',72),G9)
ctext(608,'επιβεβαιώθηκε',F('Bold',72),G9)
ctext(712,'Στείλαμε email επιβεβαίωσης',F('Regular',42),(107,114,128))
# pass card
x0,y0,x1,y1=60,830,W-60,1830
d.rounded_rectangle((x0,y0,x1,y1),radius=60,fill=G9)
my=(y0+y1)//2
d.ellipse((x0-24,my-24,x0+24,my+24),fill='white'); d.ellipse((x1-24,my-24,x1+24,my+24),fill='white')
px=x0+60; py=y0+60
d.rounded_rectangle((px,py,px+78,py+78),radius=24,fill='white')
# pin glyph (diamond)
d.polygon([(px+39,py+22),(px+56,py+39),(px+39,py+56),(px+22,py+39)],fill=G9)
d.text((px+102,py+8),'Washio',font=F('Bold',46),fill='white')
cap='ΕΠΙΒΕΒΑΙΩΣΗ ΚΡΑΤΗΣΗΣ'; fcap=F('Semibold',30)
spaced(x1-60-spaced_w(cap,fcap,4),py+26,cap,fcap,(160,164,172),4)
fl=F('Semibold',32); grey=(140,145,155)
spaced(px,py+170,'ΚΩΔΙΚΟΣ',fl,grey,4)
d.text((px,py+215),'WS-7HQ4D2',font=MONO,fill='white')
def row(x,y,c,v):
    spaced(x,y,c,F('Semibold',30),grey,4); d.text((x,y+42),v,font=F('Bold',46),fill='white')
ry=py+370
row(px,ry,'ΠΛΥΝΤΗΡΙΟ','Wash Lab Athens')
row(px,ry+140,'ΗΜ/ΝΙΑ','Σάβ 4 Οκτ'); row(px+330,ry+140,'ΩΡΑ','11:30')
row(px,ry+280,'ΥΠΗΡΕΣΙΑ','Μέσα & Έξω')
# QR
qx,qy,qs=x1-60-240,ry,240
d.rounded_rectangle((qx,qy,qx+qs,qy+qs),radius=30,fill='white')
cells=[1,1,1,0,1,1,1, 1,0,1,1,0,0,1, 1,0,1,0,1,0,1, 0,1,0,1,1,1,0, 1,0,1,1,0,1,1, 1,0,0,1,1,0,1, 1,1,1,0,1,1,1]
pad=18; gap=6; cs=(qs-2*pad-6*gap)/7
for i,c in enumerate(cells):
    if c:
        cxq=qx+pad+(i%7)*(cs+gap); cyq=qy+pad+(i//7)*(cs+gap)
        d.rounded_rectangle((cxq,cyq,cxq+cs,cyq+cs),radius=3,fill=(16,24,42))
# dashed
dy=y1-180
for xx in range(px, x1-60, 26): d.line([(xx,dy),(xx+13,dy)],fill=(70,76,90),width=4)
spaced(px,dy+66,'ΣΥΝΟΛΟ',fl,(160,164,172),4)
tot='€12.00'; ft=F('Black',72); d.text((x1-60-d.textlength(tot,font=ft),dy+40),tot,font=ft,fill='white')
# buttons
by=1900
d.rounded_rectangle((60,by,W-60,by+156),radius=36,fill=G9); ctext(by+50,'Δες τις κρατήσεις μου',F('Bold',46),'white')
by+=186
d.rounded_rectangle((60,by,W-60,by+156),radius=36,fill='white',outline=(229,231,235),width=4)
# pin icon
pxm=W//2-250; d.ellipse((pxm-18,by+52,pxm+18,by+88),outline=G9,width=6); d.polygon([(pxm-15,by+80),(pxm+15,by+80),(pxm,by+104)],fill=G9)
ctext(by+50,'   Εμφάνιση στο χάρτη',F('Bold',46),G9)
by+=186
d.rounded_rectangle((60,by,W-60,by+156),radius=36,fill='white',outline=(229,231,235),width=4); ctext(by+50,'Πίσω στην αρχική',F('Bold',46),G9)
d.rounded_rectangle((W//2-205,H-40,W//2+205,H-26),radius=7,fill=(30,30,30))
im.save('/tmp/wa/confirmed.png')
