// netlify/functions/send-order.js
exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const orderData = JSON.parse(event.body);

        // Uses your webhook URL securely from Netlify's environment variables
        const webhookUrl = process.env.WEBHOOK_URL || "https://discord.com/api/webhooks/1546720342381297687/-kyrZQTSQpZp5QUaDZyUly-QCK2dOw2ekeae_hn_Zj8miJ-imljKfvFcY9WTQ9JSzd2h";

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(orderData)
        });

        if (!response.ok) {
            throw new Error(`External service responded with status ${response.status}`);
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