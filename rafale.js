/* RetoucheProAI v12.0 — RAFALE : super-résolution multi-images (fusion de rafale), sur la carte graphique (WebGL2).
   Principe (Wronski et al., « Handheld Multi-Frame Super-Resolution », SIGGRAPH 2019 — le « Super Res Zoom » des Pixel) :
   d'une image à l'autre, une vidéo tenue à la main bouge de fractions de pixel. Chaque image voisine échantillonne donc la scène
   à des positions différentes. En alignant finement 4 voisines sur l'image courante puis en les fusionnant sur une grille 2×
   (noyaux anisotropes qui suivent les contours), on retrouve du VRAI détail filmé — rien n'est inventé —, on divise le bruit
   et les blocs de compression, et le résultat est stable d'une image à l'autre (pas de scintillement d'IA).
   Robustesse : là où l'alignement échoue (objet qui bouge, occultation, changement de plan), la voisine est écartée pixel par
   pixel ; il reste alors l'image courante seule, agrandie proprement (Catmull-Rom). Le pire cas vaut donc un agrandissement simple.
   API : RAFALE.dispo() ; const r = RAFALE.creer() ;
         r.pousser(rang, source)        source : canvas / image / VideoFrame (orientation déjà corrigée), rangs croissants ;
         r.fusion(rang, {s, R}) → canvas  s : facteur de grille (1 ou 2), R : rayon temporel (2 → 5 images) ;
         r.stats → {voisins, rob} ; r.liberer().
   Référence de réglage : tests/rafale_banc.mjs (vérité terrain, PSNR / SSIM / LPIPS, scintillement). */
var RAFALE = (() => {
  const C = 4;                       /* taille d'une case du champ de mouvement (pixels de chaque niveau) */
  const P = {                        /* réglages (calés sur le banc, voir tests/rafale_banc.mjs) */
    kd: .42, kstretch: 3.2, kshrink: 2, kdenoise: 2.4, dth: .0015, dtr: .045,
    sn: .022, amd: .5, rs: 2.2, rt: .14, w0: .08, its: 5, psf: .8, mu: .8
  };
  let support = null;
  const VS = "#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const H = "#version 300 es\nprecision highp float;precision highp int;\n";
  const FS = {
    luma: H + `uniform sampler2D t;out vec4 o;void main(){ivec2 q=ivec2(gl_FragCoord.xy);o=vec4(dot(texelFetch(t,q,0).rgb,vec3(.299,.587,.114)),0.,0.,1.);}`,
    down: H + `uniform sampler2D t;uniform ivec2 sz;out vec4 o;
      float f(ivec2 q){return texelFetch(t,clamp(q,ivec2(0),sz-1),0).r;}
      void main(){ivec2 q=ivec2(gl_FragCoord.xy)*2;float s=0.;const float w[4]=float[4](1.,3.,3.,1.);
        for(int j=0;j<4;j++)for(int i=0;i<4;i++)s+=w[i]*w[j]*f(q+ivec2(i-1,j-1));o=vec4(s/64.,0.,0.,1.);}`,
    /* appariement de blocs (fenêtre 8×8, rayon r) autour du mouvement prédit par le niveau plus grossier, ajustement parabolique */
    bm: H + `uniform sampler2D a,b,pf;uniform ivec2 sz,gp;uniform int r,hasp;out vec4 o;
      float A(ivec2 q){return texelFetch(a,clamp(q,ivec2(0),sz-1),0).r;}
      float B(ivec2 q){return texelFetch(b,clamp(q,ivec2(0),sz-1),0).r;}
      void main(){ivec2 cc=ivec2(gl_FragCoord.xy);vec2 c=vec2(cc)*${C}.+${C / 2 - .5};
        vec2 fp=vec2(0.);if(hasp==1){vec2 cg=((c+.5)*.5-.5+.5)/${C}.;fp=texture(pf,cg/vec2(gp)).rg*2.;}
        ivec2 fi=ivec2(floor(fp+.5));ivec2 o0=cc*${C}-2;float cost[25];float best=1e9;int bi=0;
        for(int dy=-2;dy<=2;dy++)for(int dx=-2;dx<=2;dx++){int k=(dy+2)*5+dx+2;
          if(abs(dx)>r||abs(dy)>r){cost[k]=1e9;continue;}
          ivec2 d=fi+ivec2(dx,dy);float s=0.;
          for(int j=0;j<8;j++)for(int i=0;i<8;i++){ivec2 q=o0+ivec2(i,j);s+=abs(A(q)-B(q+d));}
          s+=.002*float(dx*dx+dy*dy);cost[k]=s;if(s<best){best=s;bi=k;}}
        int bx=bi%5-2,by=bi/5-2;vec2 sub=vec2(0.);
        if(bx>-2&&bx<2&&abs(bx-1)<=r&&abs(bx+1)<=r){float l=cost[bi-1],m=cost[bi],h=cost[bi+1];float dd=l-2.*m+h;if(dd>1e-6)sub.x=clamp(.5*(l-h)/dd,-.5,.5);}
        if(by>-2&&by<2&&abs(by-1)<=r&&abs(by+1)<=r){float l=cost[bi-5],m=cost[bi],h=cost[bi+5];float dd=l-2.*m+h;if(dd>1e-6)sub.y=clamp(.5*(l-h)/dd,-.5,.5);}
        o=vec4(vec2(fi+ivec2(bx,by))+sub,best/64.,1.);}`,
    /* Lucas-Kanade (3 itérations, fenêtre 10×10, moyennes retirées : insensible aux variations d'exposition) */
    lk: H + `uniform sampler2D a,b,f;uniform ivec2 sz;out vec4 o;
      float A(ivec2 q){return texelFetch(a,clamp(q,ivec2(0),sz-1),0).r;}
      void main(){ivec2 cc=ivec2(gl_FragCoord.xy);vec4 f0=texelFetch(f,cc,0);vec2 fl=f0.rg;ivec2 o0=cc*${C}-3;vec2 isz=1./vec2(sz);
        float hxx=0.,hxy=0.,hyy=0.,ma=0.;
        for(int j=0;j<10;j++)for(int i=0;i<10;i++){ivec2 q=o0+ivec2(i,j);float gx=.5*(A(q+ivec2(1,0))-A(q-ivec2(1,0))),gy=.5*(A(q+ivec2(0,1))-A(q-ivec2(0,1)));
          hxx+=gx*gx;hxy+=gx*gy;hyy+=gy*gy;ma+=A(q);}
        ma/=100.;float det=hxx*hyy-hxy*hxy;
        if(det>1e-9&&hxx+hyy>1e-5){
          for(int it=0;it<3;it++){float mb=0.;for(int j=0;j<10;j++)for(int i=0;i<10;i++){vec2 q=vec2(o0+ivec2(i,j));mb+=texture(b,(q+fl+.5)*isz).r;}mb/=100.;
            float ex=0.,ey=0.;
            for(int j=0;j<10;j++)for(int i=0;i<10;i++){ivec2 q=o0+ivec2(i,j);float gx=.5*(A(q+ivec2(1,0))-A(q-ivec2(1,0))),gy=.5*(A(q+ivec2(0,1))-A(q-ivec2(0,1)));
              float e=(A(q)-ma)-(texture(b,(vec2(q)+fl+.5)*isz).r-mb);ex+=gx*e;ey+=gy*e;}
            vec2 d=vec2(hyy*ex-hxy*ey,hxx*ey-hxy*ex)/det;d=clamp(d,vec2(-1.),vec2(1.));fl+=d;if(dot(d,d)<1e-4)break;}}
        o=vec4(fl,f0.b,1.);}`,
    /* filtre médian 3×3 du champ de mouvement (supprime les cases aberrantes) */
    med: H + `uniform sampler2D f;uniform ivec2 gs;out vec4 o;
      void main(){ivec2 cc=ivec2(gl_FragCoord.xy);float x[9],y[9];int n=0;
        for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 v=texelFetch(f,clamp(cc+ivec2(i,j),ivec2(0),gs-1),0).rg;x[n]=v.x;y[n]=v.y;n++;}
        for(int i=0;i<9;i++)for(int j=i+1;j<9;j++){if(x[j]<x[i]){float t=x[i];x[i]=x[j];x[j]=t;}if(y[j]<y[i]){float t=y[i];y[i]=y[j];y[j]=t;}}
        vec2 m=vec2(x[4],y[4]),c=texelFetch(f,cc,0).rg;o=vec4(length(c-m)>.6?m:c,0.,1.);}`,
    /* noyau anisotrope d'après le tenseur de structure de l'image courante ; sortie : inverse de la covariance (a, b, c) */
    ker: H + `uniform sampler2D l;uniform ivec2 sz;uniform float kd,ks,kh,kn,dth,dtr;out vec4 o;
      float L(ivec2 q){return texelFetch(l,clamp(q,ivec2(0),sz-1),0).r;}
      void main(){ivec2 p=ivec2(gl_FragCoord.xy);float xx=0.,xy=0.,yy=0.;
        for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ivec2 q=p+ivec2(i,j);float w=(i==0?2.:1.)*(j==0?2.:1.);
          float gx=.5*(L(q+ivec2(1,0))-L(q-ivec2(1,0))),gy=.5*(L(q+ivec2(0,1))-L(q-ivec2(0,1)));xx+=w*gx*gx;xy+=w*gx*gy;yy+=w*gy*gy;}
        xx/=16.;xy/=16.;yy/=16.;float tr=xx+yy,dt=sqrt(max(0.,(xx-yy)*(xx-yy)+4.*xy*xy));float l1=.5*(tr+dt),l2=.5*(tr-dt);
        vec2 e=abs(xy)>1e-12?normalize(vec2(l1-yy,xy)):(xx>=yy?vec2(1.,0.):vec2(0.,1.));
        float A=1.+sqrt(max(0.,(l1-l2)/(l1+l2+1e-12)));float D=clamp(1.-sqrt(l1)/dtr+dth,0.,1.);
        float ka=(1.-D)*kd/(kh*A)+D*kd*kn,kl=(1.-D)*kd*ks*A+D*kd*kn;ka*=ka;kl*=kl;
        vec2 g=e,t=vec2(-e.y,e.x);float a=g.x*g.x/ka+t.x*t.x/kl,b=g.x*g.y/ka+t.x*t.y/kl,c=g.y*g.y/ka+t.y*t.y/kl;
        o=vec4(a,b,c,1.);}`,
    /* robustesse brute : écart des moyennes locales (3×3) image courante / voisine alignée, comparé au bruit + texture locale */
    rob: H + `uniform sampler2D ref,nb,f;uniform ivec2 sz,gs;uniform float sn,amd,rs,rt;out vec4 o;
      void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec2 isz=1./vec2(sz);vec2 fl=texture(f,(vec2(p)+.5)/${C}./vec2(gs)).rg;
        vec2 m=vec2(p)+fl;if(m.x<-.5||m.y<-.5||m.x>float(sz.x)-.5||m.y>float(sz.y)-.5){o=vec4(0.);return;}
        vec3 sa=vec3(0.),sb=vec3(0.),s2=vec3(0.);
        for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec3 c=texelFetch(ref,clamp(p+ivec2(i,j),ivec2(0),sz-1),0).rgb;sa+=c;s2+=c*c;
          sb+=texture(nb,(m+vec2(i,j)+.5)*isz).rgb;}
        sa/=9.;sb/=9.;vec3 va=max(vec3(0.),s2/9.-sa*sa);vec3 d=sa-sb;float d2=dot(d,d)/3.;float s=sn*sn+amd*dot(va,vec3(1./3.));
        o=vec4(clamp(rs*exp(-d2/s)-rt,0.,1.),0.,0.,1.);}`,
    ero: H + `uniform sampler2D t;uniform ivec2 sz;out vec4 o;
      void main(){ivec2 p=ivec2(gl_FragCoord.xy);float m=1.;for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++)m=min(m,texelFetch(t,clamp(p+ivec2(i,j),ivec2(0),sz-1),0).r);o=vec4(m,0.,0.,1.);}`,
    /* fusion d'une image sur la grille de sortie (accumulation additive : rgb = Σ w·couleur, a = Σ w) */
    acc: H + `uniform sampler2D nb,f,rb,kr;uniform ivec2 sz,gs;uniform float s;uniform int isref;out vec4 o;
      void main(){vec2 p=(gl_FragCoord.xy)/s-.5;vec2 isz=1./vec2(sz);
        vec2 fl=vec2(0.);float R=1.;if(isref==0){fl=texture(f,(p+.5)/${C}./vec2(gs)).rg;R=texture(rb,(p+.5)*isz).r;}
        if(R<=.002){o=vec4(0.);return;}
        vec3 K=texture(kr,(p+.5)*isz).rgb;vec2 m=p+fl;ivec2 y0=ivec2(floor(m+.5));vec3 acc=vec3(0.);float wa=0.;
        for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ivec2 y=y0+ivec2(i,j);if(y.x<0||y.y<0||y.x>=sz.x||y.y>=sz.y)continue;
          vec2 d=vec2(y)-m;float w=exp(-.5*(K.r*d.x*d.x+2.*K.g*d.x*d.y+K.b*d.y*d.y));acc+=w*texelFetch(nb,y,0).rgb;wa+=w;}
        o=vec4(acc*R,wa*R);}`,
    /* normalisation + image courante agrandie (Catmull-Rom) en appui → première estimation X0 (grille de sortie) */
    fin: H + `uniform sampler2D ac,ref;uniform ivec2 sz,os;uniform float s,w0;out vec4 o;
      vec3 F(ivec2 q){return texelFetch(ref,clamp(q,ivec2(0),sz-1),0).rgb;}
      vec4 cr(float t){float t2=t*t,t3=t2*t;return vec4(-.5*t3+t2-.5*t,1.5*t3-2.5*t2+1.,-1.5*t3+2.*t2+.5*t,.5*t3-.5*t2);}
      void main(){ivec2 q=ivec2(gl_FragCoord.xy);vec2 p=(vec2(q)+.5)/s-.5;
        ivec2 b=ivec2(floor(p));vec2 t=p-vec2(b);vec4 wx=cr(t.x),wy=cr(t.y);vec3 c=vec3(0.);
        for(int j=0;j<4;j++){vec3 r=wx.x*F(b+ivec2(-1,j-1))+wx.y*F(b+ivec2(0,j-1))+wx.z*F(b+ivec2(1,j-1))+wx.w*F(b+ivec2(2,j-1));c+=wy[j]*r;}
        vec4 a=texelFetch(ac,q,0);o=vec4((a.rgb+w0*c)/(a.a+w0),1.);}`,
    /* mouvement inverse (voisine → courante) : g(z) = −f(z + g(z)), deux itérations de point fixe */
    inv: H + `uniform sampler2D f;uniform ivec2 gs;out vec4 o;
      void main(){vec2 u=gl_FragCoord.xy;vec2 g=-texture(f,u/vec2(gs)).rg;for(int i=0;i<3;i++)g=-texture(f,(u+g/${C}.)/vec2(gs)).rg;o=vec4(g,0.,1.);}`,
    /* flou gaussien séparable (réponse de l'optique + du capteur, en pixels de sortie) */
    blur: H + `uniform sampler2D t;uniform ivec2 sz;uniform float sg;out vec4 o;
      void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 a=vec4(0.);float ws=0.;
        for(int j=-3;j<=3;j++)for(int i=-3;i<=3;i++){float w=exp(-.5*float(i*i+j*j)/(sg*sg));a+=w*texelFetch(t,clamp(p+ivec2(i,j),ivec2(0),sz-1),0);ws+=w;}o=a/ws;}`,
    /* résidu d'une image : ce qu'elle a vraiment filmé − ce que l'estimation actuelle prédit (en tenant compte du mouvement) */
    res: H + `uniform sampler2D y,xb,g,rb;uniform ivec2 sz,gs,os;uniform float s;uniform int isref;out vec4 o;
      void main(){ivec2 z=ivec2(gl_FragCoord.xy);vec2 gg=vec2(0.);float R=1.;
        if(isref==0){gg=texture(g,(vec2(z)+.5)/${C}./vec2(gs)).rg;R=texture(rb,(vec2(z)+gg+.5)/vec2(sz)).r;}
        vec2 P=(vec2(z)+gg+.5)*s;vec3 pr=texture(xb,P/vec2(os)).rgb;o=vec4((texelFetch(y,z,0).rgb-pr)*R,R);}`,
    /* rétroprojection : chaque résidu est reporté sur la grille de sortie (addition) */
    bp: H + `uniform sampler2D r,f;uniform ivec2 sz,gs;uniform float s;uniform int isref;out vec4 o;
      void main(){vec2 p=gl_FragCoord.xy/s-.5;vec2 fl=isref==1?vec2(0.):texture(f,(p+.5)/${C}./vec2(gs)).rg;vec2 m=p+fl;
        if(m.x<-.5||m.y<-.5||m.x>float(sz.x)-.5||m.y>float(sz.y)-.5){o=vec4(0.);return;}o=texture(r,(m+.5)/vec2(sz));}`,
    /* mise à jour : X += μ · correction moyenne */
    upd: H + `uniform sampler2D x,c;uniform float mu;out vec4 o;
      void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 k=texelFetch(c,p,0);o=vec4(texelFetch(x,p,0).rgb+mu*k.rgb/max(k.a,.05),1.);}`,
    /* sortie dans le canvas (retournement vertical) */
    out: H + `uniform sampler2D x;uniform ivec2 os;out vec4 o;
      void main(){ivec2 q=ivec2(int(gl_FragCoord.x),os.y-1-int(gl_FragCoord.y));o=vec4(clamp(texelFetch(x,q,0).rgb,0.,1.),1.);}`
  };

  function dispo() {
    if (support != null) return support;
    try { const c = document.createElement("canvas"), g = c.getContext("webgl2"); support = !!(g && g.getExtension("EXT_color_buffer_float")); const e = g && g.getExtension("WEBGL_lose_context"); if (e) e.loseContext() }
    catch (e) { support = false }
    return support;
  }

  function creer(opt) {
    opt = Object.assign({}, P, opt || {});
    const cv = document.createElement("canvas"); cv.width = cv.height = 1;
    const gl = cv.getContext("webgl2", { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) throw new Error("RAFALE : WebGL2 flottant indisponible");
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const prog = {}, U = {};
    for (const k in FS) {
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error("RAFALE " + k + " : " + gl.getShaderInfoLog(o)); return o };
      const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS[k])); gl.bindAttribLocation(p, 0, "p"); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("RAFALE " + k + " : " + gl.getProgramInfoLog(p));
      prog[k] = p; U[k] = {};
    }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const fb = gl.createFramebuffer();
    const FMT = { r: [gl.R16F, gl.RED], rg: [gl.RG16F, gl.RG], rgba: [gl.RGBA16F, gl.RGBA], c: [gl.RGBA8, gl.RGBA] };
    function tex(w, h, f) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      const [i, fm] = FMT[f]; gl.texStorage2D(gl.TEXTURE_2D, 1, i, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      t.w = w; t.h = h; return t;
    }
    function u(k, n) { return U[k][n] !== undefined ? U[k][n] : (U[k][n] = gl.getUniformLocation(prog[k], n)) }
    /* lance un programme : cible (texture ou null = canvas), échantillonneurs, uniformes */
    function run(k, out, w, h, smp, uni) {
      gl.useProgram(prog[k]);
      if (out) { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0) }
      else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      let i = 0; for (const n in smp) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, smp[n]); gl.uniform1i(u(k, n), i); i++ }
      for (const n in uni) { const v = uni[n], l = u(k, n); if (l == null) continue;
        if (Array.isArray(v)) { if (v.int) gl.uniform2i(l, v[0], v[1]); else gl.uniform2f(l, v[0], v[1]) }
        else if (typeof v === "object") gl.uniform1i(l, v.i); else gl.uniform1f(l, v) }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    const iv = (a, b) => { const r = [a, b]; r.int = true; return r }, ii = x => ({ i: x });

    let W = 0, Hh = 0, NL = 0, sizes = [], grids = [];
    const ring = new Map(), tmp = {};
    let pool = [];   /* entrées libérées, réutilisées (évite de recréer les textures à chaque image) */
    function reset(w, h) {
      for (const e of ring.values()) libererE(e); ring.clear(); for (const e of pool) libererE(e); pool = [];
      for (const k in tmp) { if (Array.isArray(tmp[k])) tmp[k].forEach(t => t && gl.deleteTexture(t)); else gl.deleteTexture(tmp[k]); delete tmp[k] }
      W = w; Hh = h; sizes = []; grids = [];
      let lw = w, lh = h; for (NL = 0; NL < 6; NL++) { sizes.push([lw, lh]); grids.push([Math.ceil(lw / C), Math.ceil(lh / C)]); if (Math.min(lw, lh) < 48) { NL++; break } lw = Math.ceil(lw / 2); lh = Math.ceil(lh / 2) }
      tmp.fa = grids.map(([a, b]) => tex(a, b, "rg")); tmp.fb = grids.map(([a, b]) => tex(a, b, "rg"));
      tmp.flow = []; tmp.rob = []; tmp.z = tex(1, 1, "rg"); tmp.g = []; tmp.ker = tex(w, h, "rgba"); tmp.r0 = tex(w, h, "r");
    }
    function libererE(e) { gl.deleteTexture(e.c); e.L.forEach(t => gl.deleteTexture(t)) }
    function entree() {
      if (pool.length) return pool.pop();
      return { c: tex(W, Hh, "c"), L: sizes.map(([a, b]) => tex(a, b, "r")) };
    }
    function pousser(rang, src) {
      const w = src.videoWidth || src.displayWidth || src.naturalWidth || src.width, h = src.videoHeight || src.displayHeight || src.naturalHeight || src.height;
      if (w !== W || h !== Hh) reset(w, h);
      if (ring.has(rang)) return;
      const e = entree(); e.r = rang;
      gl.bindTexture(gl.TEXTURE_2D, e.c); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
      run("luma", e.L[0], W, Hh, { t: e.c }, {});
      for (let l = 1; l < NL; l++) run("down", e.L[l], sizes[l][0], sizes[l][1], { t: e.L[l - 1] }, { sz: iv(...sizes[l - 1]) });
      ring.set(rang, e);
    }
    function oublier(avant) { for (const [r, e] of ring) if (r < avant) { ring.delete(r); pool.push(e) } }
    /* champ de mouvement ref → voisine (niveau 0, en pixels), dans tmp.flow[k] */
    function flot(a, b, k) {
      if (!tmp.flow[k]) tmp.flow[k] = tex(grids[0][0], grids[0][1], "rg");
      let prev = null;
      for (let l = NL - 1; l >= 0; l--) {
        const [gw, gh] = grids[l], o1 = tmp.fa[l], o2 = tmp.fb[l];
        run("bm", o1, gw, gh, { a: a.L[l], b: b.L[l], pf: prev || tmp.z }, { sz: iv(...sizes[l]), gp: iv(...(prev ? grids[l + 1] : [1, 1])), r: ii(l >= 2 ? 2 : 1), hasp: ii(prev ? 1 : 0) });
        let cur = o1;
        if (l <= 1) { run("lk", o2, gw, gh, { a: a.L[l], b: b.L[l], f: o1 }, { sz: iv(...sizes[l]) }); cur = o2 }
        const dst = l === 0 ? tmp.flow[k] : (cur === o1 ? o2 : o1);
        run("med", dst, gw, gh, { f: cur }, { gs: iv(gw, gh) });
        prev = dst;
      }
      return tmp.flow[k];
    }
    const stats = { voisins: 0 };
    function fusion(rang, o) {
      o = Object.assign({ s: 2, R: 2 }, o || {});
      const ref = ring.get(rang); if (!ref) throw new Error("RAFALE : image " + rang + " absente");
      const s = o.s, ow = Math.round(W * s), oh = Math.round(Hh * s);
      if (cv.width !== ow || cv.height !== oh) { cv.width = ow; cv.height = oh }
      if (!tmp.acc || tmp.acc.w !== ow || tmp.acc.h !== oh) { if (tmp.acc) gl.deleteTexture(tmp.acc); tmp.acc = tex(ow, oh, "rgba") }
      run("ker", tmp.ker, W, Hh, { l: ref.L[0] }, { sz: iv(W, Hh), kd: opt.kd, ks: opt.kstretch, kh: opt.kshrink, kn: opt.kdenoise, dth: opt.dth, dtr: opt.dtr });
      const vois = []; for (let d = 1; d <= o.R; d++) for (const r of [rang - d, rang + d]) if (ring.has(r)) vois.push(ring.get(r));
      vois.forEach((b, k) => {
        const f = flot(ref, b, k);
        if (!tmp.rob[k]) tmp.rob[k] = tex(W, Hh, "r");
        run("rob", tmp.r0, W, Hh, { ref: ref.c, nb: b.c, f }, { sz: iv(W, Hh), gs: iv(...grids[0]), sn: opt.sn, amd: opt.amd, rs: opt.rs, rt: opt.rt });
        run("ero", tmp.rob[k], W, Hh, { t: tmp.r0 }, { sz: iv(W, Hh) });
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tmp.acc, 0);
      gl.viewport(0, 0, ow, oh); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.blendEquation(gl.FUNC_ADD);
      const U0 = { sz: iv(W, Hh), gs: iv(...grids[0]), s };
      run("acc", tmp.acc, ow, oh, { nb: ref.c, f: tmp.ker, rb: tmp.ker, kr: tmp.ker }, { ...U0, isref: ii(1) });
      vois.forEach((b, k) => run("acc", tmp.acc, ow, oh, { nb: b.c, f: tmp.flow[k], rb: tmp.rob[k], kr: tmp.ker }, { ...U0, isref: ii(0) }));
      gl.disable(gl.BLEND);
      const T = n => { if (!tmp[n] || tmp[n].w !== ow || tmp[n].h !== oh) { if (tmp[n]) gl.deleteTexture(tmp[n]); tmp[n] = tex(ow, oh, "rgba") } return tmp[n] };
      let X = T("X"), X2 = T("X2"); const Xb = T("Xb"), Cc = tmp.acc;
      run("fin", X, ow, oh, { ac: tmp.acc, ref: ref.c }, { sz: iv(W, Hh), os: iv(ow, oh), s, w0: opt.w0 });
      /* rétroprojection itérative (Irani-Peleg) : l'estimation est corrigée jusqu'à ce que, refilmée par chaque image
         (mouvement + optique + capteur), elle redonne ce que chaque image a réellement enregistré — c'est ce qui rend le détail */
      const its = o.its != null ? o.its : opt.its;
      if (its > 0) {
        if (!tmp.res) tmp.res = tex(W, Hh, "rgba");
        vois.forEach((b, k) => { if (!tmp.g[k]) tmp.g[k] = tex(grids[0][0], grids[0][1], "rg"); run("inv", tmp.g[k], grids[0][0], grids[0][1], { f: tmp.flow[k] }, { gs: iv(...grids[0]) }) });
        const imgs = [[ref, null, null, null, 1], ...vois.map((b, k) => [b, tmp.g[k], tmp.rob[k], tmp.flow[k], 0])];
        for (let it = 0; it < its; it++) {
          run("blur", Xb, ow, oh, { t: X }, { sz: iv(ow, oh), sg: opt.psf });
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, Cc, 0);
          gl.viewport(0, 0, ow, oh); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
          for (const [im, g, rb, f, isr] of imgs) {
            run("res", tmp.res, W, Hh, { y: im.c, xb: Xb, g: g || tmp.ker, rb: rb || tmp.ker }, { sz: iv(W, Hh), gs: iv(...grids[0]), os: iv(ow, oh), s, isref: ii(isr) });
            gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
            run("bp", Cc, ow, oh, { r: tmp.res, f: f || tmp.ker }, { sz: iv(W, Hh), gs: iv(...grids[0]), s, isref: ii(isr) });
            gl.disable(gl.BLEND);
          }
          run("blur", Xb, ow, oh, { t: Cc }, { sz: iv(ow, oh), sg: opt.psf });
          run("upd", X2, ow, oh, { x: X, c: Xb }, { mu: opt.mu });
          const t = X; X = X2; X2 = t;
        }
      }
      run("out", null, ow, oh, { x: X }, { os: iv(ow, oh) });
      stats.voisins = vois.length;
      if (o.mesure) {   /* robustesse moyenne (diagnostic, lecture lente) */
        const px = new Float32Array(4), rs = [];
        for (let k = 0; k < vois.length; k++) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tmp.rob[k], 0);
          const a = new Float32Array(W * Hh * 4); gl.readPixels(0, 0, W, Hh, gl.RGBA, gl.FLOAT, a); let sm = 0; for (let i = 0; i < a.length; i += 4) sm += a[i]; rs.push(sm / (W * Hh));
        }
        stats.rob = rs; void px;
      }
      oublier(rang - o.R);
      return cv;
    }
    /* contrôle : l'addition sur texture flottante fonctionne-t-elle (certains pilotes la refusent) ? */
    (() => {
      const t = tex(2, 2, "rgba"); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("RAFALE : cible flottante refusée");
      gl.viewport(0, 0, 2, 2); gl.clearColor(.25, .25, .25, .25); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.clearColor(0, 0, 0, 0);
      gl.useProgram(prog.ero); gl.activeTexture(gl.TEXTURE0); const t1 = tex(1, 1, "r"); gl.bindTexture(gl.TEXTURE_2D, t1); gl.uniform1i(u("ero", "t"), 0); gl.uniform2i(u("ero", "sz"), 1, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disable(gl.BLEND);
      const a = new Float32Array(16); gl.readPixels(0, 0, 2, 2, gl.RGBA, gl.FLOAT, a);
      gl.deleteTexture(t); gl.deleteTexture(t1);
      if (!(Math.abs(a[3] - 1.25) < .01)) throw new Error("RAFALE : addition flottante indisponible (" + a[3] + ")");
    })();
    return {
      pousser, fusion, oublier, stats, opt, canvas: cv,
      liberer() { try { reset(1, 1); for (const e of pool) libererE(e); pool = []; const x = gl.getExtension("WEBGL_lose_context"); if (x) x.loseContext() } catch (e) { } }
    };
  }
  return { dispo, creer, P };
})();
