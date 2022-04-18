const {App} = require('@slack/bolt');

const token = process.argv[2]
const appToken = process.argv[3]
const client_id = process.argv[4]
const api_key = process.argv[5]
const service_token = process.argv[6]

const config = {
    client_id: client_id,
    api_key: api_key,
    service_token: service_token
}

const app = new App({
    token: token,
    appToken: appToken,
    socketMode: true,
});

(async () => {

    // Start your app
    await app.start();

    app.command('/grapheene', async (stuff) => {
        const {ack, body, client, respond, say} = stuff;
        ack();
        try {

            const result = await app.client.users.info({
                user: body.user_id
            });

            const ringName = [body.team_id, body.channel_id]

            const Grapheene = require('@grapheene/grapheene')(config.client_id, config.api_key, config.service_token);
            if (body.text.match(/^encrypt/)) {
                const text = body.text.replace(/^encrypt/, "");
                await respond('Encryption in progress...');
                Grapheene.setup()
                    .then(() => {
                        Grapheene.kmf.ring.create(ringName.join(":"))
                            .then(async (ring) => {
                                const member = await ring.addMember({
                                    name: body.channel_id
                                })
                                const data = await member.data().encrypt(text, 'encrypted');
                                const toPost = {

                                    username: result.user.real_name,
                                    icon_url: result.user.profile.image_512,
                                    text: encodeURIComponent(data.encrypted)
                                }
                                if (body.channel_name === 'directmessage') {

                                    say(toPost).catch(async (e) => {
                                        if (e.data.error === "channel_not_found") {
                                            await respond("To DM an encrypted message, create a DM with Grapheene and your target user first.")
                                        } else {
                                            await respond("An unknown error has happened. We have reported the error for you!")
                                        }
                                    });

                                } else {
                                    toPost.channel = body.channel_id;
                                    client.chat.postMessage(toPost).catch(async (e) => {
                                        if (e.data.error === "channel_not_found") {
                                            await respond("Grapheene could not find this channel, ensure that the Grapheene App has been invited to the channel.")
                                        } else {
                                            await respond("An unknown error has happened. We have reported the error for you!")
                                        }
                                    });
                                }
                            });
                    })


            }
        } catch (error) {
            console.error(error.data.error);
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
        const ringName = [payload.team.id, payload.channel.id]
        try {

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


        } catch (error) {
            console.error(error);
        }
    });

    console.log('⚡️ Bolt app is running!');
})();
