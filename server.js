const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const app = express();

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const sessions = new Map();

app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,'public')));

function defaultStore(){
  return {orders:[], bookings:[], contacts:[], customRequests:[], products:[], owner:null, settings:{defaultProductionDays:7, shopMessage:'Please visit SHIVIRA JEWELS again.'}};
}
function readStore(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true});
  if(!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE,JSON.stringify(defaultStore(),null,2));
  try{
    const s=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    const d=defaultStore();
    return {...d,...s,products:Array.isArray(s.products)?s.products:[],orders:Array.isArray(s.orders)?s.orders:[],bookings:Array.isArray(s.bookings)?s.bookings:[],contacts:Array.isArray(s.contacts)?s.contacts:[],customRequests:Array.isArray(s.customRequests)?s.customRequests:[],settings:{...d.settings,...(s.settings||{})}};
  }catch{return defaultStore();}
}
function writeStore(s){fs.writeFileSync(DATA_FILE,JSON.stringify(s,null,2));}
function id(prefix){return prefix+'-'+crypto.randomBytes(4).toString('hex').toUpperCase()}
function cookieParse(req){const out={};(req.headers.cookie||'').split(';').forEach(x=>{const i=x.indexOf('=');if(i>0)out[x.slice(0,i).trim()]=decodeURIComponent(x.slice(i+1));});return out;}
function makeToken(){return crypto.createHmac('sha256',SESSION_SECRET).update(crypto.randomBytes(32)).digest('hex')}
function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');const hash=crypto.scryptSync(String(password),salt,64).toString('hex');return `scrypt:${salt}:${hash}`;}
function verifyPassword(password,stored){try{const [scheme,salt,key]=String(stored).split(':');if(scheme!=='scrypt'||!salt||!key)return false;const hash=crypto.scryptSync(String(password),salt,64).toString('hex');return crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(key,'hex'));}catch{return false;}}
function currentOwner(){return readStore().owner;}
function requireAdmin(req,res,next){const token=cookieParse(req).shivira_admin;if(!token||!sessions.has(token))return res.status(401).json({message:'Owner login required.'});req.owner=sessions.get(token);next();}
function adminPage(req,res,next){const token=cookieParse(req).shivira_admin;if(!token||!sessions.has(token))return res.redirect('/owner-admin.html');next();}
function setSessionCookie(res,token){res.setHeader('Set-Cookie',`shivira_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.NODE_ENV==='production'?'; Secure':''}`)}
function addDays(date,days){const d=new Date(date);d.setDate(d.getDate()+Math.max(0,Number(days)||0));return d.toISOString();}

app.get('/api/health',(req,res)=>res.json({ok:true,service:'SHIVIRA JEWELS API',time:new Date().toISOString()}));

app.get('/api/products',(req,res)=>{
  const s=readStore();let out=[...s.products];const q=String(req.query.q||'').toLowerCase(),cat=String(req.query.category||'');
  if(q)out=out.filter(p=>(p.name+' '+p.category+' '+p.material+' '+p.description).toLowerCase().includes(q));
  if(cat)out=out.filter(p=>p.category===cat);res.json(out);
});
app.get('/api/products/:id',(req,res)=>{const p=readStore().products.find(x=>x.id===req.params.id);p?res.json(p):res.status(404).json({message:'Product not found'});});

app.post('/api/orders',(req,res)=>{
  const {name,phone,email='',address,city='',state='',pin='',items}=req.body;
  if(!name||!phone||!address||!Array.isArray(items)||!items.length)return res.status(400).json({message:'Name, phone, address and cart items are required.'});
  const s=readStore();let total=0;
  try{
    const clean=items.map(i=>{const p=s.products.find(x=>x.id===i.productId);const qty=Math.max(1,Number(i.quantity)||1);if(!p)throw Error('Invalid product');total+=Number(p.price)*qty;return {productId:p.id,name:p.name,quantity:qty,price:Number(p.price),image:p.image};});
    const productionDays=Math.max(1,Number(s.settings.defaultProductionDays)||7);
    const createdAt=new Date().toISOString();
    const order={id:id('ORD'),name:String(name).trim(),phone:String(phone).trim(),email:String(email).trim(),address:String(address).trim(),city:String(city).trim(),state:String(state).trim(),pin:String(pin).trim(),items:clean,total,status:'Approved',productionDays,readyBy:addDays(createdAt,productionDays),createdAt};
    s.orders.unshift(order);writeStore(s);
    res.status(201).json({ok:true,order,invoiceUrl:`/invoice.html?orderId=${encodeURIComponent(order.id)}`});
  }catch(e){res.status(400).json({message:e.message||'Unable to place order.'});}
});
app.get('/api/orders/:id',(req,res)=>{const order=readStore().orders.find(o=>o.id===req.params.id);order?res.json({ok:true,order,shopMessage:readStore().settings.shopMessage}):res.status(404).json({message:'Order not found'});});

app.post('/api/bookings',(req,res)=>{const {name,phone,email='',date,time,service='Private Jewellery Consultation',message=''}=req.body;if(!name||!phone||!date||!time)return res.status(400).json({message:'Name, phone, date and time are required.'});const booking={id:id('BK'),name,phone,email,date,time,service,message,status:'Pending',createdAt:new Date().toISOString()};const s=readStore();s.bookings.unshift(booking);writeStore(s);res.status(201).json({ok:true,booking});});
app.post('/api/contact',(req,res)=>{const {name,phone,email='',message}=req.body;if(!name||!message)return res.status(400).json({message:'Name and message are required.'});const item={id:id('MSG'),name,phone,email,message,createdAt:new Date().toISOString()};const s=readStore();s.contacts.unshift(item);writeStore(s);res.status(201).json({ok:true,item});});
app.post('/api/custom-jewellery',(req,res)=>{const {name,phone,email='',type,metal,gemstone,size,style,budget,description=''}=req.body;if(!name||!phone||!type)return res.status(400).json({message:'Name, phone and jewellery type are required.'});const item={id:id('CJ'),name,phone,email,type,metal,gemstone,size,style,budget,description,status:'Pending',createdAt:new Date().toISOString()};const s=readStore();s.customRequests.unshift(item);writeStore(s);res.status(201).json({ok:true,item});});

// Owner setup/login. Setup is available only once, before an owner account exists.
app.get('/api/admin/setup-status',(req,res)=>res.json({setupRequired:!currentOwner()}));
app.post('/api/admin/signup',(req,res)=>{
  const {username,password}=req.body||{};const s=readStore();
  if(s.owner)return res.status(409).json({message:'Owner account already exists. Use Owner Login.'});
  if(!username||String(username).trim().length<3)return res.status(400).json({message:'Username must be at least 3 characters.'});
  if(!password||String(password).length<8)return res.status(400).json({message:'Password must be at least 8 characters.'});
  s.owner={username:String(username).trim(),passwordHash:hashPassword(password),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};writeStore(s);
  const token=makeToken();sessions.set(token,{username:s.owner.username,createdAt:Date.now()});setSessionCookie(res,token);res.status(201).json({ok:true,username:s.owner.username});
});
app.post('/api/admin/reset-owner',(req,res)=>{
  const {resetKey,newUsername,newPassword}=req.body||{};
  const key=process.env.OWNER_RESET_KEY;

  if(!key || resetKey!==key)
    return res.status(403).json({message:'Invalid reset key.'});

  if(!newUsername || String(newUsername).trim().length<3)
    return res.status(400).json({message:'Username must be at least 3 characters.'});

  if(!newPassword || String(newPassword).length<8)
    return res.status(400).json({message:'Password must be at least 8 characters.'});

  const s=readStore();

  s.owner={
    username:String(newUsername).trim(),
    passwordHash:hashPassword(newPassword),
    createdAt:s.owner?.createdAt||new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };

  writeStore(s);

  res.json({
    ok:true,
    message:'Owner account reset successfully.',
    username:s.owner.username
  });
});
app.post('/api/admin/login',(req,res)=>{const {username,password}=req.body||{};const owner=currentOwner();if(!owner)return res.status(428).json({message:'Owner setup is required first.'});if(String(username||'')!==owner.username||!verifyPassword(password,owner.passwordHash))return res.status(401).json({message:'Invalid owner credentials.'});const token=makeToken();sessions.set(token,{username:owner.username,createdAt:Date.now()});setSessionCookie(res,token);res.json({ok:true,username:owner.username});});
app.post('/api/admin/logout',(req,res)=>{const token=cookieParse(req).shivira_admin;if(token)sessions.delete(token);res.setHeader('Set-Cookie','shivira_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');res.json({ok:true});});
app.get('/api/admin/me',requireAdmin,(req,res)=>res.json({ok:true,username:req.owner.username}));
app.put('/api/admin/account',requireAdmin,(req,res)=>{const {currentPassword,newUsername,newPassword}=req.body||{};const s=readStore();if(!s.owner||!verifyPassword(currentPassword,s.owner.passwordHash))return res.status(401).json({message:'Current password is incorrect.'});if(newUsername!==undefined&&String(newUsername).trim().length>=3)s.owner.username=String(newUsername).trim();if(newPassword!==undefined&&String(newPassword).length>=8)s.owner.passwordHash=hashPassword(newPassword);s.owner.updatedAt=new Date().toISOString();writeStore(s);for(const [token,session] of sessions){if(session.username===req.owner.username)session.username=s.owner.username;}res.json({ok:true,username:s.owner.username});});

app.get('/api/admin/summary',requireAdmin,(req,res)=>{const s=readStore();const delivered=s.orders.filter(o=>o.status==='Delivered').length;const approved=s.orders.filter(o=>o.status==='Approved').length;const revenue=s.orders.reduce((n,o)=>n+Number(o.total||0),0);res.json({ok:true,counts:{orders:s.orders.length,bookings:s.bookings.length,contacts:s.contacts.length,customRequests:s.customRequests.length,products:s.products.length},metrics:{revenue,delivered,approved},settings:s.settings,orders:s.orders,bookings:s.bookings,contacts:s.contacts,customRequests:s.customRequests,products:s.products});});
app.patch('/api/admin/orders/:id',requireAdmin,(req,res)=>{const s=readStore(),o=s.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({message:'Order not found.'});if(req.body.status!==undefined)o.status=String(req.body.status);if(req.body.productionDays!==undefined){const days=Math.max(1,Number(req.body.productionDays)||1);o.productionDays=days;o.readyBy=addDays(o.createdAt,days);}writeStore(s);res.json({ok:true,order:o});});
app.post('/api/admin/products',requireAdmin,(req,res)=>{const {name,category,price,image='',material='',weight='',rating=0,description=''}=req.body;if(!name||!category||!price)return res.status(400).json({message:'Name, category and price are required.'});const s=readStore(),product={id:id('PRD').toLowerCase(),name:String(name),category:String(category),price:Number(price),image:String(image),material:String(material),weight:String(weight),rating:Number(rating||0),description:String(description)};s.products.push(product);writeStore(s);res.status(201).json({ok:true,product});});
app.put('/api/admin/products/:id',requireAdmin,(req,res)=>{const s=readStore(),p=s.products.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({message:'Product not found.'});for(const k of ['name','category','image','material','weight','description'])if(req.body[k]!==undefined)p[k]=String(req.body[k]);if(req.body.price!==undefined)p.price=Number(req.body.price);if(req.body.rating!==undefined)p.rating=Number(req.body.rating);writeStore(s);res.json({ok:true,product:p});});
app.delete('/api/admin/products/:id',requireAdmin,(req,res)=>{const s=readStore();const before=s.products.length;s.products=s.products.filter(x=>x.id!==req.params.id);if(s.products.length===before)return res.status(404).json({message:'Product not found.'});writeStore(s);res.json({ok:true});});
app.put('/api/admin/settings',requireAdmin,(req,res)=>{const s=readStore();if(req.body.defaultProductionDays!==undefined)s.settings.defaultProductionDays=Math.max(1,Number(req.body.defaultProductionDays)||7);if(req.body.shopMessage!==undefined)s.settings.shopMessage=String(req.body.shopMessage).slice(0,200);writeStore(s);res.json({ok:true,settings:s.settings});});
app.post('/api/admin/clear-test-data',requireAdmin,(req,res)=>{const s=readStore();s.orders=[];s.bookings=[];s.contacts=[];s.customRequests=[];writeStore(s);res.json({ok:true});});

app.get('/admin',adminPage,(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/owner-admin.html',(req,res)=>res.sendFile(path.join(__dirname,'public','owner-admin.html')));
app.get('/invoice.html',(req,res)=>res.sendFile(path.join(__dirname,'public','invoice.html')));

app.listen(PORT,()=>console.log(`SHIVIRA JEWELS running at http://localhost:${PORT}`));
