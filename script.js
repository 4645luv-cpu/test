const track=document.getElementById('slTrack'),viewport=document.getElementById('slViewport'),dotsEl=document.getElementById('slDots'),slides=Array.from(track.querySelectorAll('.sl-slide'));
let idx=0,perView=3,maxIdx=0,autoTimer=null;
function calcPerView(){return window.innerWidth<=600?1:window.innerWidth<=900?2:3;}
function slideWidth(){const gap=20;return(viewport.offsetWidth-gap*(perView-1))/perView+gap;}
function buildDots(){dotsEl.innerHTML='';for(let i=0;i<=maxIdx;i++){const b=document.createElement('button');b.className='sl-dot'+(i===idx?' active':'');b.setAttribute('aria-label','スライド '+(i+1));b.addEventListener('click',()=>goTo(i));dotsEl.appendChild(b);}}
function updateDots(){dotsEl.querySelectorAll('.sl-dot').forEach((d,i)=>d.classList.toggle('active',i===idx));}
function goTo(i){idx=Math.max(0,Math.min(i,maxIdx));track.style.transform='translateX(-'+(idx*slideWidth())+'px)';updateDots();}
function next(){goTo(idx>=maxIdx?0:idx+1);}function prev(){goTo(idx<=0?maxIdx:idx-1);}
function initSlider(){perView=calcPerView();maxIdx=Math.max(0,slides.length-perView);if(idx>maxIdx)idx=0;track.style.transition='none';track.style.transform='translateX(-'+(idx*slideWidth())+'px)';requestAnimationFrame(()=>{track.style.transition='transform .5s cubic-bezier(.25,.46,.45,.94)';});buildDots();}
document.getElementById('slNext').addEventListener('click',next);
document.getElementById('slPrev').addEventListener('click',prev);
let dragStartX=0,dragging=false,startOffset=0;
viewport.addEventListener('mousedown',e=>{dragging=true;dragStartX=e.clientX;startOffset=-idx*slideWidth();track.style.transition='none';});
window.addEventListener('mousemove',e=>{if(!dragging)return;track.style.transform='translateX('+(startOffset+e.clientX-dragStartX)+'px)';});
window.addEventListener('mouseup',e=>{if(!dragging)return;dragging=false;track.style.transition='transform .5s cubic-bezier(.25,.46,.45,.94)';const d=e.clientX-dragStartX;if(d<-50)next();else if(d>50)prev();else goTo(idx);});
viewport.addEventListener('touchstart',e=>{dragStartX=e.touches[0].clientX;startOffset=-idx*slideWidth();track.style.transition='none';},{passive:true});
viewport.addEventListener('touchmove',e=>{track.style.transform='translateX('+(startOffset+e.touches[0].clientX-dragStartX)+'px)';},{passive:true});
viewport.addEventListener('touchend',e=>{track.style.transition='transform .5s cubic-bezier(.25,.46,.45,.94)';const d=e.changedTouches[0].clientX-dragStartX;if(d<-50)next();else if(d>50)prev();else goTo(idx);});
function startAuto(){stopAuto();autoTimer=setInterval(next,4000);}function stopAuto(){if(autoTimer){clearInterval(autoTimer);autoTimer=null;}}
viewport.parentElement.addEventListener('mouseenter',stopAuto);
viewport.parentElement.addEventListener('mouseleave',startAuto);
window.addEventListener('resize',initSlider);
window.addEventListener('load',()=>{initSlider();startAuto();});
const attAttend=document.getElementById('attAttend'),attAbsent=document.getElementById('attAbsent');
function updateAtt(){const val=document.querySelector('input[name="att"]:checked').value;attAttend.classList.toggle('active',val==='attend');attAbsent.classList.toggle('active',val==='absent');}
attAttend.addEventListener('change',updateAtt);attAbsent.addEventListener('change',updateAtt);updateAtt();
document.getElementById('rsvpForm').addEventListener('submit',e=>{e.preventDefault();const ok=document.getElementById('formOk'),btn=e.target.querySelector('.submit-btn');btn.disabled=true;btn.textContent='送信中...';setTimeout(()=>{btn.textContent='回答を送信する →';btn.disabled=false;ok.classList.add('show');e.target.reset();updateAtt();setTimeout(()=>ok.classList.remove('show'),5000);},900);});
const io=new IntersectionObserver(entries=>{entries.forEach(en=>{if(en.isIntersecting)en.target.classList.add('visible');});},{threshold:0.1});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
const hamburger=document.getElementById('hamburger'),mobileMenu=document.getElementById('mobileMenu');
hamburger.addEventListener('click',()=>mobileMenu.classList.toggle('open'));
function closeMobile(){mobileMenu.classList.remove('open');}
