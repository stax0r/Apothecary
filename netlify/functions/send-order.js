// netlify/functions/send-order.js
exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const orderData = JSON.parse(event.body);

        // Uses your webhook URL securely from Netlify's environment variables
        const webhookUrl = process.env.WEBHOOK_URL || "https://discord.com/api/webhooks/1546720342381297687/-kyrZQTSQpZp5QUaDZyUly-QCK2dOw2ekeae_hn_Zj8miJ-imljKfvFcY9WTQ9JSzd2h";

        // Format the data into a valid Discord Webhook embed payload
        const discordPayload = {
            embeds: [{
                title: "🛒 New Custom Order Received",
                color: 3829499, // Hex #3a86ff in decimal
                fields: [
                    { name: "Customer Name", value: orderData.name || "Unknown", inline: true },
                    { name: "Discord ID", value: orderData.discordId || "N/A", inline: true },
                    { name: "Delivery Location", value: orderData.activeLocation || "Not specified", inline: false },
                    { name: "Order Items", value: orderData.orderItems || "No items", inline: false },
                    { name: "Estimated Total", value: orderData.estimatedTotal || "0 Gold", inline: true },
                    { name: "Instructions / Notes", value: orderData.deliveryInstructions || "None", inline: false }
                ],
                timestamp: new Date().toISOString()
            }]
        };

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(discordPayload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Discord API responded with status ${response.status}: ${errorText}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: "Order dispatched successfully." })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};