const express = require('express')
const app = express()
const fs = require('fs')
const http = require('http').Server(app)
const io = require('socket.io')(http);
const multer = require('multer');
const path = require('path');

//NEEDED FOR GETTING IMAGES FROM STORAGE
const { Storage } = require('@google-cloud/storage');
const keyFilename = path.join(__dirname, 'phoco-c6bcd-8c69dd3e958a.json');
const storage = new Storage({
    keyFilename: keyFilename,
});

const bodyParser = require('body-parser')
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }))
app.set('view engine', 'ejs')

let users = {};
if (fs.existsSync('users.json')) {
    users = JSON.parse(fs.readFileSync('users.json'))
}

let allalbums = {};
if (fs.existsSync('albums.json')) {
    allalbums = JSON.parse(fs.readFileSync('albums.json'))
}

let logedInUserName = ''
let logedInUserEmail = ''
let nameOfCreation = ''
let piccounter = 0

app.get('/', (req, res) => {
    if (logedInUserEmail) {
        res.redirect('main', { name: logedInUserName, accessibleAlbums });
    } else {
        res.render('welcome')
    }
})

//LOGIN
app.get('/signup', (req, res) => {
    if (!logedInUserEmail) {
        res.render('signup')
    }
    else {
        res.redirect('main', { name: logedInUserName, accessibleAlbums });
    }
})
app.post('/signup', (req, res) => {
    const name = req.body.name
    const pass = req.body.password
    const confpass = req.body.confpassword
    const email = req.body.email

    if (users[email]) {
        res.render('signup', { message: "ERROR: Email already used" })
    }
    else if (confpass != pass) {
        res.render('signup', { userName: "", userPass: "", message: "ERROR: Password and confirm are not the same" })
    }
    else {
        users[email] = { password: pass, name: name }
        fs.writeFileSync('users.json', JSON.stringify(users))
        logedInUserName = name
        logedInUserEmail = email
        res.render('main', { name: logedInUserName, accessibleAlbums });
    }
})
app.get('/login', (req, res) => {
    if (!logedInUserEmail) {
        res.render('login')
    }
    else {
        res.render('main')
    }
})
app.post('/login', (req, res) => {
    pass = req.body.password
    email = req.body.email
    if (users[email]) {
        if (users[email]["password"] == pass) {
            logedInUserEmail = email
            logedInUserName = users[email]["name"]
            res.redirect('/main')
        }
        else {
            res.render('login', { message: "ERROR: Wrong password" })
        }
    }
    else {
        res.render('login', { message: "ERROR: Email does not exist" })
    }
})

//MAIN AND LOG OUT
app.get('/main', (req, res) => {
    if (!logedInUserEmail) {
        res.redirect('/login');
        return;
    }
    if (creatingNowName != '') {
        allalbums[creatingNowName] = creatingNow;
        creatingNowName = ''
        creatingNow = '';
        fs.writeFileSync('albums.json', JSON.stringify(allalbums));
    }
    const accessibleAlbums = {};
    const promises = [];
    for (const [albumName, albumDetails] of Object.entries(allalbums)) {
        const realname = albumDetails.realName
        const albumAccess = albumDetails.access;
        if (albumAccess.includes(logedInUserEmail)) {
            const imageUrl = albumDetails.imageUrl;
            if (imageUrl) {
                accessibleAlbums[albumName] = { ...albumDetails, imageUrl };
            } else {
                const imageRef = storage.bucket('phoco-c6bcd.appspot.com').file(`${albumName}-0.jpg`);
                const promise = new Promise((resolve, reject) => {
                    imageRef.getSignedUrl({ action: 'read', expires: '03-17-2025' }, (err, url) => {
                        if (err) {
                            console.error(err);
                            reject(err);
                        } else {
                            const updatedAlbumDetails = { ...albumDetails, imageUrl: url };
                            accessibleAlbums[albumName] = updatedAlbumDetails;
                            allalbums[albumName] = updatedAlbumDetails;
                            fs.writeFileSync('albums.json', JSON.stringify(allalbums));
                            resolve();
                        }
                    });
                });

                promises.push(promise);
            }
        }
    }

    Promise.all(promises)
        .then(() => {
            // Render the main page with the accessible albums and their cover images
            res.render('main', { name: logedInUserName, accessibleAlbums });
        })
        .catch((err) => {
            console.error(err);
            res.status(500).send('Server error');
        });
});
io.on('connection', (socket) => {
    socket.on('log-out', () => {
        logedInUserName = ""
        logedInUserEmail = ""
        socket.emit('redirect', '/');
    })
    socket.on('redirect', (url) => {
        socket.emit('redirect', url);
    });
})

//CREATING ALBUMS
app.get('/createalbum-p1', (req, res) => {
    if (!logedInUserEmail) {
        res.redirect('/login');
        return;
    }
    res.render('createalbum-p1', { creatorEmail: logedInUserEmail })
})
const upload = multer({ storage: multer.memoryStorage() })
const admin = require('firebase-admin');
const serviceAccount = require('./phoco-c6bcd-firebase-adminsdk-klg2p-56915a218d.json')
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'phoco-c6bcd.appspot.com'
});
const storage2 = new Storage({
    projectId: 'phoco-c6bcd',
    keyFilename: './phoco-c6bcd-firebase-adminsdk-klg2p-56915a218d.json'
});

creatingNow = {}
creatingNowName = ''
app.post('/createalbum-p1', upload.single('image'), async (req, res) => {
    const name = req.body.name;
    const image = req.file;
    if (allalbums[name + '-' + logedInUserEmail]) {
        res.redirect('createalbum-p1');
        return;
    }
    const bucket = storage2.bucket('phoco-c6bcd.appspot.com');
    const file = bucket.file(`${name}-${logedInUserEmail}-${piccounter}.jpg`);
    const contents = req.file.buffer;
    const options = {
        contentType: req.file.mimetype,
        metadata: {},
    };
    try {
        await file.save(contents, options);
        // Get the signed URL for the uploaded image
        const imageUrl = await file.getSignedUrl({ action: 'read', expires: '03-17-2025' });
        // Add the album object to allalbums with the image URL
        creatingNowName = name + '-' + logedInUserEmail
        creatingNow.realName = name
        creatingNow.access = logedInUserEmail
        creatingNow.imageUrl = imageUrl[0]
        piccounter++;
        res.redirect('createalbum-p2');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error uploading image.');
    }
});


app.get('/createalbum-p2', (req, res) => {
    if (!logedInUserEmail) {
        res.render('login')
    }
    res.render('createalbum-p2', { creatorEmail: logedInUserEmail })
})

app.post('/createalbum-p2', upload.fields([
    { name: 'image-input-1', maxCount: 1 },
    { name: 'image-input-2', maxCount: 1 },
    { name: 'image-input-3', maxCount: 1 },
]), async (req, res) => {
    const subtitle = req.body.subtitle;
    const description = req.body.description;
    const images = req.files;
    // Check that all required fields have been filled in
    if (!subtitle) {
        res.status(400).send('Subtitle is required.');
        return;
    }
    if (!description) {
        res.status(400).send('Description is required.');
        return;
    }
    if (!images['image-input-1'] || !images['image-input-2'] || !images['image-input-3']) {
        res.status(400).send('All three images are required.');
        return;
    }
    const bucket = storage2.bucket('phoco-c6bcd.appspot.com');
    try {
        // Upload each image to Google Cloud Storage and get the signed URL for it
        const urls = {};
        piccounter = 1
        for (const [key, value] of Object.entries(images)) {
            const name = key.replace('image', '');
            const file = bucket.file(`${creatingNowName}-FirstPage-${piccounter}.jpg`);
            const contents = value[0].buffer;
            const options = {
                contentType: value[0].mimetype,
                metadata: {},
            };
            await file.save(contents, options);
            const imageUrl = await file.getSignedUrl({ action: 'read', expires: '03-17-2025' });
            urls['FirstPage-' + piccounter] = imageUrl[0];
            piccounter += 1;
        }
        creatingNow.subtitle = subtitle
        creatingNow.description = description
        creatingNow.images = urls
        res.redirect('/createalbum-p3');
    } catch (error) {
        console.error(error);
    }
});



//createalbum-p3
app.get('/createalbum-p3', (req, res) => {
    if (!logedInUserEmail) {
        res.redirect('/login');
        return;
    }

    res.render('createalbum-p3', { creatorEmail: logedInUserEmail });
});

app.post('/createalbum-p3', upload.fields([
    { name: 'image-input-1', maxCount: 1 },
    { name: 'image-input-2', maxCount: 1 },
    { name: 'image-input-3', maxCount: 1 },
]), async (req, res) => {
    const subtitle = req.body.subtitle;
    const images = req.files;
    // Check that all required fields have been filled in
    if (!subtitle) {
        res.status(400).send('Subtitle is required.');
        return;
    }
    if (!images['image-input-1'] || !images['image-input-2'] || !images['image-input-3']) {
        res.status(400).send('All three images are required.');
        return;
    }
    const bucket = storage2.bucket('phoco-c6bcd.appspot.com');
    try {
        // Upload each image to Google Cloud Storage and get the signed URL for it
        const urls = {};
        let piccounter = 1;
        for (const [key, value] of Object.entries(images)) {
            const name = key.replace('image', '');
            const file = bucket.file(`${creatingNowName}-People-${subtitle}-${piccounter}.jpg`);
            const contents = value[0].buffer;
            const options = {
                contentType: value[0].mimetype,
                metadata: {},
            };
            await file.save(contents, options);
            const imageUrl = await file.getSignedUrl({ action: 'read', expires: '03-17-2025' });
            urls[`People-${subtitle}-${piccounter}`] = imageUrl[0];
            piccounter += 1;
        }
        // Add the album object to allalbums with the image URLs
        if (!creatingNow['People']) {
            creatingNow['People'] = {};
        }
        creatingNow['People'][subtitle] = {};
        creatingNow['People'][subtitle]['images'] = urls;
        creatingNow['People'][subtitle]['memo'] = {}
        // Redirect the user to the "continue or finish" page
        res.redirect('/createalbum-p3-contOrNot');
    } catch (error) {
        console.error(error);
    }
});



app.get('/createalbum-p3-contOrNot', (req, res) => {
    if (!logedInUserEmail) {
        res.redirect('/login');
        return;
    }

    res.render('createalbum-p3-contOrNot', { creatorEmail: logedInUserEmail })
})



app.post('/createalbum-p3-add-person', (req, res) => {
    res.redirect('/createalbum-p3');
});

app.post('/createalbum-p3-finish', (req, res) => {
    res.redirect('/');
});


app.get('/createalbum-p3-contOrNot', (req, res) => {
    if (!logedInUserEmail) {
        res.redirect('/login');
        return;
    }

    res.render('createalbum-p3-contOrNot', { creatorEmail: logedInUserEmail })
})


app.get('/viewalbum', (req, res) => {
    if (!logedInUserEmail) {
        res.redirect('/login');
        return;
    }

    const albumId = req.query.albumName;
    const album = allalbums[albumId];
    if (album) {
        res.render('templateForPOne.ejs', {
            realname: album.realName,
            albumCover: album.imageUrl,
            albumName: albumId,
            albumPic1: album.images['FirstPage-1'],
            albumPic2: album.images['FirstPage-2'],
            albumPic3: album.images['FirstPage-3'],
            albumSubtitle: album.subtitle,
            albumDescription: album.description
        });
    } else {
    }
});

app.get('/viewalbum/viewpeople', (req, res) => {
    if (!logedInUserEmail) {
        res.redirect('/login');
        return;
    }

    const albumId = req.query.name;
    const album = allalbums[albumId];
    if (album) {
        const people = album.People;
        const peopleArray = Object.keys(people).map((person) => ({
            name: person,
            images: Object.values(people[person].images),
        }));
        res.render('showpeople.ejs', {
            realname: album.realName,
            albumName: albumId,
            people: peopleArray,
        });
    } else {
        res.status(404).send('Album not found');
    }

});

app.get('/viewalbum/viewpeople/memo', (req, res) => { 
    if (!logedInUserEmail) {
        res.redirect('/login');
        return;
    }
    person = req.query.person
    albumname = req.query.name
    alb = allalbums[albumname]
    personalb = allalbums[albumname]['People'][person]
    if (!personalb['memo']) {
        personalb['memo'] = {}
    }
    const memoriesArr = personalb['memo']
    if (!personalb['memo']['comments']) {
        personalb['memo']['comments'] = {}
    }   
    const commentsArr = personalb['memo']['comments']
    delete memoriesArr['comments'];
    res.render('viewmemo.ejs', { person, alb, memoriesArr, albumname, commentsArr })
}) 

app.post('/addmemopost', upload.single('memoimage'), async (req, res) => {
    const memotext = req.body.text;
    const memoimage = req.file;
    const personsname = req.body.person;
    albumname = req.body.albname;
    alb = allalbums[albumname]

    const bucket = storage2.bucket('phoco-c6bcd.appspot.com');
    const file = bucket.file(`memo-${albumname}-${personsname}-${memotext}.jpg`);
    const contents = req.file.buffer;
    const options = {
        contentType: req.file.mimetype,
        metadata: {},
    };
    try {
        await file.save(contents, options);
        const imageUrl = await file.getSignedUrl({ action: 'read', expires: '03-17-2025' });
        if(!allalbums[albumname]['People'][personsname]['memo'])
        {
            allalbums[albumname]['People'][personsname]['memo'] = {}
        }
        allalbums[albumname]['People'][personsname]['memo'][memotext] = imageUrl;
        fs.writeFileSync('albums.json', JSON.stringify(allalbums));
        console.log('Image saved to Firebase Storage');
        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error uploading image.');
    }
});

app.post('/addcommentpost', (req,res) => {
    const comname = req.body.name;
    const comtext = req.body.text;

    console.log(comname)
    console.log(comtext)


    res.status(200).send('Comment added successfully.');
})


  
http.listen(4000, () => {
    console.log('listening on *:4000')
})

