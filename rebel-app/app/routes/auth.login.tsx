import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw await login(request);
  }
  const errors = await login(request);
  return json({ errors });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = await login(request);
  return json({ errors });
};

export default function AuthLogin() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");

  const errors = actionData?.errors || loaderData?.errors;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f6f6f7",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        padding: "20px",
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: "40px",
          borderRadius: "12px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          maxWidth: "420px",
          width: "100%",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "22px",
            fontWeight: "700",
            marginBottom: "8px",
            color: "#202223",
          }}
        >
          Log in
        </h1>
        <p
          style={{
            color: "#6d7175",
            fontSize: "14px",
            marginBottom: "24px",
            lineHeight: "1.5",
          }}
        >
          Enter your Shopify store domain to access the Rebel Gifts App.
        </p>

        {errors && "shop" in errors && errors.shop && (
          <div
            style={{
              color: "#d72c0d",
              background: "#fff4f4",
              border: "1px solid #fecaca",
              padding: "10px",
              borderRadius: "6px",
              marginBottom: "16px",
              fontSize: "13px",
            }}
          >
            {String(errors.shop)}
          </div>
        )}

        <Form
          method="post"
          style={{ display: "flex", flexDirection: "column", gap: "14px" }}
        >
          <input
            type="text"
            name="shop"
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            placeholder="rebel-gifts-dev.myshopify.com"
            style={{
              padding: "12px 14px",
              border: "1px solid #c9cccf",
              borderRadius: "8px",
              fontSize: "14px",
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "12px",
              background: "#000",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontWeight: "600",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Log in
          </button>
        </Form>
      </div>
    </div>
  );
}
