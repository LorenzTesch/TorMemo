const CONF = require('./config.json');

const fs = require('fs');
const path = require('path');
const express = require('express');


const app = express();
const helmet = require('helmet');

app.use(helmet({
    contentSecurityPolicy: false
}));
app.disable('x-powered-by');

app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.set('view engine', 'ejs');

const crypto = require('crypto');

const iv = '';
const algorithm = 'aes-256-ecb';
const memoPath = CONF.storagePath;

const hostname = CONF.hostname;

const maxMemoLength = 2400;

const noticeTexts = [
    'Memo does not exist.',
    `Memo is longer than ${maxMemoLength} characters.`,
    'Unknown error.',
    'Incorrect password.'
]

const MIDLength = 10;

function randomNumberString() {
    let result = '';
    const characters = '0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < MIDLength) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter++;
    }
    return result;
}

function isNumber(n){
    return !isNaN(parseFloat(n)) && !isNaN(n - 0);
}

function encryptMemo(buffer, password){
    password = crypto.createHash('sha256').update(password).digest('utf16');
    var cipher = crypto.createCipheriv(algorithm, Buffer.from(password), iv);
    var crypted = Buffer.concat([
        cipher.update(buffer),
        cipher.final()
    ]);
    return crypted;
}

function decryptMemo(buffer, password){
    password = crypto.createHash('sha256').update(password).digest('utf16');
    var decipher = crypto.createDecipheriv(algorithm, Buffer.from(password), iv);
    var decrypted = Buffer.concat([
        decipher.update(buffer),
        decipher.final()
    ]);
    return decrypted.toString();
}

app.get('/', (req, res)=>{
    res.locals.maxMemoLength = maxMemoLength;
    res.locals.message = '';
    res.render('index');
})

app.post('/', (req, res)=>{

    res.locals.maxMemoLength = maxMemoLength;
    res.locals.message = '';

    try{

        var memo = req.body.memo;

        var password = req.body.password;
    
        if(memo > maxMemoLength){
            return res.status(413).render('index', {
                success: false,
                message: noticeTexts[1]
            })
        }
    
        var mid = randomNumberString();
    
        fs.writeFileSync(path.join(memoPath, `${mid}-${Date.now()}`), encryptMemo(Buffer.from(memo), password));
    
        var link = `http://${hostname}/v/${mid}`;
    
        res.render('index', {
            success: true,
            message: `Your memo was successfully created. Click the following url once to <span style="background-color: #0078D7">highlight</span> it. You can view it at: <u style="user-select: all;">${link}</u>`
        })

    }catch(e){
        console.log(e);
        return res.status(500).render('index', {
            success: false,
            message: noticeTexts[2]
        })
    }

})

app.get('/v/:mid', (req, res)=>{

    res.locals.message = '';

    var password = req.query.password || '';

    if(!password){
        return res.render('unlock');
    }

    var mid = req.params.mid;

    if(!isNumber(mid)){
        return res.status(404).render('unlock', {
            success: false,
            message: noticeTexts[0]
        });
    }

    var fileName = fs.readdirSync(memoPath).find(fn => fn.startsWith(`${mid}-`));

    if(fileName){
        var filePath = path.join(CONF.storagePath, fileName);
        var memoBuffer = fs.readFileSync(filePath);
    }else{
        return res.status(404).render('unlock', {
            success: false,
            message: noticeTexts[0]
        });
    }

    try{
        var memoText = decryptMemo(memoBuffer, password);
        fs.unlinkSync(filePath);
    }catch(e){
        return res.status(403).render('unlock', {
            success: false,
            message: noticeTexts[3]
        });
    }

    res.set('Content-Type', 'text/plain');
    res.send(memoText);

})

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next)=>{
    res.redirect('/');
})

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('');
})

app.listen(CONF.port, () => {
    console.log('Server is running on port', CONF.port);
})



function deleteFiles(){

    var ts = Date.now();

    // get names of all expired memos
    var fileNames = fs.readdirSync(memoPath).filter((fn)=>{
        return parseInt(fn.split('-')[1]) + CONF.expireAfter < ts;
    }) || [];

    fileNames.forEach((fileName)=>{
        fs.unlinkSync(path.join(CONF.storagePath, fileName));
    });

    setTimeout(deleteFiles, CONF.expireInterval);

}

deleteFiles();