const {App} = require('@slack/bolt');

const token = 'Slack API Token'
const appToken = 'Slack APP Token'
const client_id = 'Client ID from Grapheene Dashboard'
const api_key = 'API Key from Grapheene Dashboard'
const service_token = 'Service Token from Grapheene Dashboard'

const config = {
    client_id: client_id,
    api_key: api_key,
    service_token: service_token
}

// Setup the Slack SDK
const app = new App({
    token: token,
    appToken: appToken,
    socketMode: true,
});

// Setup the Grapheene SDK
const Grapheene = require('@grapheene/grapheene')(config.client_id, config.api_key, config.service_token);

(async () => {

    // Start your app
    await app.start();

    // Setup the listner for the slash command
    app.command('/grapheene', async (stuff) => {
        const {ack, body, client, respond, say} = stuff;
        // We send an ack back to the client so the slash event does not time out
        ack();

        // Wrap in a try catch because error handling is a good thing
        try {

            // Gather the specific user from Slack
            const result = await app.client.users.info({
                user: body.user_id
            });

            // Form the ring name we want to use
            const ringName = [body.team_id, body.channel_id]

            // If we want multiple commands we want to match the argument that is sent with the command
            if (body.text.match(/^encrypt/)) {

                // remove the argument from the body text
                const text = body.text.replace(/^encrypt/, "");

                // Let the user know we are doing some Grapheene magic
                await respond('Encryption in progress...');

                // Ensure the Grapheene setup process has been completed
                Grapheene.setup()
                    .then(() => {
                        // Create a new key ring based off of the formation from earlier, we want this to be able to recall the name and have it unique
                        Grapheene.kmf.ring.create(ringName.join(":"))
                            .then(async (ring) => {

                                // We will add a member to the key ring, in this instance we are saying the channel is the member
                                // This gives access to anyone in the slack channel access to this key ring
                                // If we wanted to limit access we would only send the specific identity of the user
                                const member = await ring.addMember({
                                    name: body.channel_id
                                })

                                // Perform encryption
                                const data = await member.data().encrypt(text, 'encrypted');

                                // Form our message back to the Slack channel
                                const toPost = {

                                    username: result.user.real_name,
                                    icon_url: result.user.profile.image_512,
                                    // URI encode so it plays nicely with Slack markup language
                                    text: encodeURIComponent(data.encrypted)
                                }

                                // We are not acting as the user, so if there is a direct message we let the user know to invite the bot to the conversation first
                                if (body.channel_name === 'directmessage') {

                                    say(toPost).catch(async (e) => {
                                        if (e.data.error === "channel_not_found") {
                                            await respond("To DM an encrypted message, create a DM with Grapheene and your target user first.")
                                        } else {
                                            await respond("An unknown error has happened. We have reported the error for you!")
                                        }
                                    });

                                } else {
                                    // Now we send the encrypted data back to the channel in the message body
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

    // To simplify the decrypt process we use a modal
    app.shortcut('decrypt_message', async ({ack, payload, client}) => {
        // Acknowledge modal request so the process does not timeout
        ack();

        // Create the modal view
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

        // Form the ring name
        const ringName = [payload.team.id, payload.channel.id]
        try {

            // Ensure the Grapheeene SDK setup process is complete (already should, so it will just proceed)
            Grapheene.setup()
                .then(() => {
                    // Even though the method used is create, this will load the ring name. This augments error handling and won't throw an error if the ring name doesn't exist
                    Grapheene.kmf.ring.create(ringName.join(":"))
                        .then(async (ring) => {

                            // We "add" the member, because it already exists on the key ring it will load the member. Again, simplifies error handling
                            const member = await ring.addMember({
                                name: payload.channel.id
                            })

                            // We recall the uri encoded encrypted data
                            const data = await ring.getData('encrypted');

                            // We decode the URI encoded cipher text
                            data.encrypted = decodeURIComponent(payload.message.text)

                            // Now we decrypt the cipher

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
                                                // Now we display the cipher in the modal which is ephemeral, so it is never saved in Slack as plain text
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
