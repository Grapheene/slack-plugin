require('dotenv').config()
const {App} = require('@slack/bolt');

const fs = require("fs-extra")
const path = require("path");
const md5 = require("md5");

const rootDir = path.dirname(__filename);
console.log(rootDir)

const app = new App({
    token: process.env.SLACK_USER_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
});
(async () => {

    // Start your app
    await app.start(process.env.PORT || 3000);


    app.event('message', (message) => {
        //console.log(message);
    });
    // /grapheene config {"client_id":"CLFD7DDDAEE1664B58A22D2F60CF1B6339", "api_key": "CK16ABD005298546508B032066F1836A8F", "service_token":"00ggz2yoqTmUQgnm2696"}
    app.command('/grapheene', async (stuff) => {
        const {ack, body, client, respond, say} = stuff;
        ack();
        try {
            const teamDir = rootDir + '/user/' + body.team_id

            const result = await app.client.users.info({
                user: body.user_id
            });

            const ringName = [body.api_app_id, body.team_id, body.channel_id]

            if (body.text.match(/^configure|^config/)) {
                if (result.user.is_admin) {
                    const config = JSON.parse(`${body.text.replace(/^configure |^config /, "")}`);
                    if (config.hasOwnProperty("client_id") && config.hasOwnProperty("api_key") && config.hasOwnProperty("service_token")) {
                        fs.ensureDirSync(teamDir)
                        fs.writeJsonSync(teamDir + '/config.json', config)
                        const Grapheene = require('@grapheene/grapheene')(config.client_id, config.api_key, config.service_token);
                        Grapheene.setup()
                            .then(() => {
                                Grapheene.kmf.ring.create(ringName.join(":"))
                                    .then(async (ring) => {
                                        console.log('Ring Created')
                                        await respond('Setup Complete!');
                                    }).catch((e) => {
                                    console.log(e.message);
                                });
                            })
                    } else {
                        await respond('Invalid configuration');
                    }

                } else {
                    await respond('Only and admin can perform this function');
                }
            }
            if (fs.existsSync(teamDir + '/config.json')) {
                const config = fs.readJsonSync(teamDir + '/config.json')
                const Grapheene = require('@grapheene/grapheene')(config.client_id, config.api_key, config.service_token);
                if (body.text.match(/^encrypt/)) {
                    console.log(body)
                    const text = body.text.replace(/^encrypt/, "");

                    Grapheene.setup()
                        .then(() => {
                            Grapheene.kmf.ring.create(ringName.join(":"))
                                .then(async (ring) => {
                                    const member = await ring.addMember({
                                        name: body.channel_id
                                    })
                                    const data = await member.data().encrypt(text, 'encrypted');
                                    console.log('Ring Created')
                                    console.log(data)
                                    const toPost = {
                                        channel: body.channel_id,
                                        user_name: body.user_name,
                                        user_id: body.user_id,
                                        text: encodeURIComponent(data.encrypted)
                                    }
                                    await say(toPost);
                                }).catch((e) => {
                                console.log(e.message);
                            });
                        })


                }
            } else {
                await respond('An admin must setup Grapheene first with /grapheen config {"client_id":"Your Client ID", "api_key": "Your API Key", "service_token":"Your Service Token"}');
            }


        } catch (error) {
            console.error(error);
        }


    });

    app.shortcut('decrypt_message', async ({ack, payload, client}) => {
        // Acknowledge shortcut request
        ack();
        const res = await client.views.open({
            trigger_id: payload.trigger_id,
            view: {
                "type": "modal",
                "title": {
                    "type": "plain_text",
                    "text": "Grapheene"
                },
                "close": {
                    "type": "plain_text",
                    "text": "Cancel"
                },
                "blocks": [
                    {
                        "type": "section",
                        "text": {
                            "type": "plain_text",
                            "text": ":man-biking: Decryption in progress..."
                        }
                    }
                ]
            }
        });
        const teamDir = rootDir + '/user/' + payload.team.id
        // const ringName = [body.api_app_id, body.team_id, body.channel_id]
        const ringName = [payload.message.bot_profile.app_id, payload.team.id, payload.channel.id]
        console.log(payload)
        try {
            // Call the views.open method using the WebClient passed to listeners
            if (fs.existsSync(teamDir + '/config.json')) {
                const config = fs.readJsonSync(teamDir + '/config.json')
                const Grapheene = require('@grapheene/grapheene')(config.client_id, config.api_key, config.service_token);

                Grapheene.setup()
                    .then(() => {
                        Grapheene.kmf.ring.create(ringName.join(":"))
                            .then(async (ring) => {
                                const member = await ring.addMember({
                                    name: payload.channel.id
                                })
                                const data = await ring.getData('encrypted');

                                data.encrypted = decodeURIComponent(payload.message.text)
                                console.log(data)
                                const decrypted = await member.data().decrypt(data)
                                const viewId = res.view.id;
                                await client.views.update({
                                    view_id: viewId,
                                    view: {
                                        "type": "modal",
                                        "title": {
                                            "type": "plain_text",
                                            "text": "Grapheene"
                                        },
                                        "close": {
                                            "type": "plain_text",
                                            "text": "Close"
                                        },
                                        "blocks": [
                                            {
                                                "type": "section",
                                                "text": {
                                                    "type": "mrkdwn",
                                                    "text": decrypted.decrypted
                                                }
                                            }
                                        ]
                                    }
                                });

                            }).catch((e) => {
                            console.log(e.message);
                        });
                    })


            } else {
                await respond('An admin must setup Grapheene first with /grapheen config {"client_id":"Your Client ID", "api_key": "Your API Key", "service_token":"Your Service Token"}');
            }



        } catch (error) {
            console.error(error);
        }
    });

    app.shortcut('open_modal', async ({ack, payload, client}) => {
        // Acknowledge shortcut request
        ack();

        try {
            // Call the views.open method using the WebClient passed to listeners
            const result = await client.views.open({
                trigger_id: payload.trigger_id,
                view: {
                    "type": "modal",
                    "title": {
                        "type": "plain_text",
                        "text": "My App2"
                    },
                    "close": {
                        "type": "plain_text",
                        "text": "Close"
                    },
                    "blocks": [
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": "About the simplest modal you could conceive of :smile:\n\nMaybe <https://api.slack.com/reference/block-kit/interactive-components|*make the modal interactive*> or <https://api.slack.com/surfaces/modals/using#modifying|*learn more advanced modal use cases*>."
                            }
                        },
                        {
                            "type": "context",
                            "elements": [
                                {
                                    "type": "mrkdwn",
                                    "text": "Psssst this modal was designed using <https://api.slack.com/tools/block-kit-builder|*Block Kit Builder*>"
                                }
                            ]
                        }
                    ]
                }
            });

            console.log(result);
        } catch (error) {
            console.error(error);
        }
    });

    console.log('⚡️ Bolt app is running!');
})();