import { html, nothing } from "lit";
import { styleMap } from "lit/directives/style-map.js";

export type DashboardAssistWidgetProps = {
  conversationId: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
    createdAt: number;
  }>;
  input: string;
  sending: boolean;
  mediaSending: boolean;
  error: string | null;
  isMinimized: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onScreenshot: () => void;
  onUploadFromDevice: () => void;
  onToggleMinimize: () => void;
  onClose: () => void;
};

const styles = {
  container: {
    position: "fixed",
    right: "18px",
    bottom: "18px",
    width: "min(420px, calc(100vw - 24px))",
    height: "min(620px, calc(100vh - 24px))",
    "z-index": "91",
    display: "flex",
    "flex-direction": "column",
    background: "linear-gradient(145deg, rgba(30, 32, 38, 0.95) 0%, rgba(20, 22, 28, 0.98) 100%)",
    "border-radius": "16px",
    "box-shadow":
      "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
    "backdrop-filter": "blur(20px)",
    overflow: "hidden",
    "font-family": "'DM Sans', 'Satoshi', system-ui, sans-serif",
    transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
    transform: "translateY(0)",
    opacity: "1",
  },
  minimized: {
    height: "auto",
    "max-height": "60px",
    transform: "translateY(calc(100% - 60px))",
    opacity: "0.9",
  },
  header: {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    padding: "16px 18px",
    background: "linear-gradient(90deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%)",
    "border-bottom": "1px solid rgba(255, 255, 255, 0.06)",
    cursor: "grab",
  },
  headerLeft: {
    display: "flex",
    "align-items": "center",
    gap: "12px",
  },
  avatar: {
    width: "36px",
    height: "36px",
    "border-radius": "10px",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "font-size": "16px",
    "box-shadow": "0 4px 12px rgba(99, 102, 241, 0.3)",
  },
  headerText: {},
  title: {
    "font-size": "15px",
    "font-weight": "600",
    color: "#f0f0f5",
    "letter-spacing": "-0.02em",
    "margin-bottom": "2px",
  },
  subtitle: {
    "font-size": "11px",
    color: "rgba(255, 255, 255, 0.4)",
    display: "flex",
    "align-items": "center",
    gap: "6px",
  },
  statusDot: {
    width: "6px",
    height: "6px",
    "border-radius": "50%",
    background: "#22c55e",
    "box-shadow": "0 0 8px rgba(34, 197, 94, 0.6)",
    animation: "pulse 2s infinite",
  },
  headerRight: {
    display: "flex",
    "align-items": "center",
    gap: "8px",
  },
  convId: {
    "font-size": "10px",
    color: "rgba(255, 255, 255, 0.3)",
    "font-family": "mono",
    background: "rgba(255, 255, 255, 0.05)",
    padding: "4px 8px",
    "border-radius": "6px",
  },
  iconBtn: {
    width: "28px",
    height: "28px",
    "border-radius": "8px",
    border: "none",
    background: "rgba(255, 255, 255, 0.06)",
    color: "rgba(255, 255, 255, 0.5)",
    cursor: "pointer",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "font-size": "14px",
    transition: "all 0.2s ease",
  },
  messagesArea: {
    flex: "1",
    overflow: "auto",
    padding: "16px",
    background: "radial-gradient(ellipse at top, rgba(99, 102, 241, 0.03) 0%, transparent 50%)",
    "scroll-behavior": "smooth",
  },
  message: {
    "margin-bottom": "12px",
    padding: "12px 14px",
    "border-radius": "14px",
    "max-width": "85%",
    animation: "slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
    "word-break": "break-word",
  },
  userMessage: {
    "margin-left": "auto",
    background: "linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)",
    "box-shadow": "0 4px 16px rgba(99, 102, 241, 0.3)",
    color: "#fff",
    "border-bottom-right-radius": "4px",
  },
  assistantMessage: {
    background: "rgba(255, 255, 255, 0.06)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    color: "rgba(255, 255, 255, 0.85)",
    "border-bottom-left-radius": "4px",
  },
  messageLabel: {
    "font-size": "10px",
    "text-transform": "uppercase",
    "letter-spacing": "0.08em",
    "margin-bottom": "6px",
    opacity: "0.6",
  },
  messageText: {
    "font-size": "13px",
    "line-height": "1.5",
    "white-space": "pre-wrap",
  },
  emptyState: {
    "text-align": "center",
    padding: "40px 20px",
    color: "rgba(255, 255, 255, 0.3)",
  },
  typingIndicator: {
    display: "flex",
    gap: "4px",
    padding: "12px 14px",
    "border-radius": "14px",
    background: "rgba(255, 255, 255, 0.06)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    width: "fit-content",
  },
  typingDot: {
    width: "6px",
    height: "6px",
    "border-radius": "50%",
    background: "rgba(255, 255, 255, 0.4)",
    animation: "bounce 1.4s infinite ease-in-out",
  },
  inputArea: {
    padding: "16px",
    background: "rgba(0, 0, 0, 0.2)",
    "border-top": "1px solid rgba(255, 255, 255, 0.06)",
  },
  textarea: {
    width: "100%",
    "min-height": "72px",
    padding: "12px 14px",
    "border-radius": "12px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    background: "rgba(255, 255, 255, 0.04)",
    color: "#fff",
    "font-family": "inherit",
    "font-size": "13px",
    "line-height": "1.5",
    resize: "none",
    outline: "none",
    transition: "all 0.2s ease",
    "box-sizing": "border-box",
  },
  inputFooter: {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    "margin-top": "10px",
  },
  sendBtn: {
    padding: "10px 20px",
    "border-radius": "10px",
    border: "none",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    color: "#fff",
    "font-weight": "600",
    "font-size": "13px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    "box-shadow": "0 4px 12px rgba(99, 102, 241, 0.3)",
  },
  mediaMenu: {
    position: "relative",
  },
  mediaMenuBtn: {
    padding: "8px 12px",
    "border-radius": "10px",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    background: "rgba(255, 255, 255, 0.06)",
    color: "rgba(255, 255, 255, 0.86)",
    "font-size": "12px",
    "font-weight": "500",
    cursor: "pointer",
  },
  mediaMenuList: {
    position: "absolute",
    left: "0",
    bottom: "40px",
    width: "210px",
    padding: "8px",
    margin: "0",
    "list-style": "none",
    background: "rgba(18, 20, 25, 0.98)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    "border-radius": "12px",
    "box-shadow": "0 10px 24px rgba(0, 0, 0, 0.45)",
  },
  mediaMenuItemBtn: {
    width: "100%",
    padding: "9px 10px",
    "border-radius": "8px",
    border: "none",
    background: "transparent",
    color: "rgba(255, 255, 255, 0.9)",
    "font-size": "12px",
    "text-align": "left",
    cursor: "pointer",
  },
  sendBtnDisabled: {
    opacity: "0.5",
    cursor: "not-allowed",
  },
  refreshNote: {
    "font-size": "10px",
    color: "rgba(255, 255, 255, 0.3)",
  },
  error: {
    "margin-top": "10px",
    padding: "10px 12px",
    "border-radius": "8px",
    background: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    color: "#fca5a5",
    "font-size": "12px",
  },
};

export function renderDashboardAssistWidget(props: DashboardAssistWidgetProps) {
  const containerStyles = {
    ...styles.container,
    ...(props.isMinimized ? styles.minimized : {}),
  };

  return html`
    <style>
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
      
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      
      @keyframes bounce {
        0%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-6px); }
      }
      
      * {
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.1) transparent;
      }
      
      *::-webkit-scrollbar {
        width: 6px;
      }
      
      *::-webkit-scrollbar-track {
        background: transparent;
      }
      
      *::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.1);
        border-radius: 3px;
      }
    </style>
    
    <section class="widget-container" style=${styleMap(containerStyles)}>
      <!-- Header -->
      <div class="widget-header" style=${styleMap(styles.header)}>
        <div style=${styleMap(styles.headerLeft)}>
          <div style=${styleMap(styles.avatar)}>🕴️</div>
          <div style=${styleMap(styles.headerText)}>
            <div style=${styleMap(styles.title)}>Dashboard Assistant</div>
            <div style=${styleMap(styles.subtitle)}>
              <span style=${styleMap(styles.statusDot)}></span>
              Live relay
            </div>
          </div>
        </div>
        <div style=${styleMap(styles.headerRight)}>
          <span style=${styleMap(styles.convId)}>${props.conversationId.slice(0, 8)}</span>
          <button 
            style=${styleMap(styles.iconBtn)}
            @click=${props.onToggleMinimize}
            title=${props.isMinimized ? "Expand" : "Minimize"}
          >
            ${props.isMinimized ? "□" : "—"}
          </button>
          <button 
            style=${styleMap(styles.iconBtn)}
            @click=${props.onClose}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Messages -->
      <div 
        class="messages-area" 
        style=${styleMap(styles.messagesArea)}
        @scroll=${(e: Event) => {
          const target = e.target as HTMLElement;
          target.scrollTop = target.scrollHeight;
        }}
      >
        ${
          props.messages.length === 0
            ? html`
          <div style=${styleMap(styles.emptyState)}>
            <div style="font-size: 32px; margin-bottom: 12px;">💬</div>
            <div>No messages yet</div>
            <div style="font-size: 11px; margin-top: 4px;">Start a conversation...</div>
          </div>
        `
            : props.messages.map(
                (message, index) => html`
          <div 
            style=${styleMap({
              ...styles.message,
              ...(message.role === "user" ? styles.userMessage : styles.assistantMessage),
              "animation-delay": `${index * 0.05}s`,
            })}
          >
            <div style=${styleMap(styles.messageLabel)}>
              ${message.role === "assistant" ? "Assistant" : "You"}
            </div>
            <div style=${styleMap(styles.messageText)}>${message.text}</div>
          </div>
        `,
              )
        }
        
        ${
          props.sending
            ? html`
          <div style=${styleMap(styles.typingIndicator)}>
            <span style=${styleMap({ ...styles.typingDot, "animation-delay": "0s" })}></span>
            <span style=${styleMap({ ...styles.typingDot, "animation-delay": "0.2s" })}></span>
            <span style=${styleMap({ ...styles.typingDot, "animation-delay": "0.4s" })}></span>
          </div>
        `
            : nothing
        }
      </div>

      <!-- Input -->
      <div style=${styleMap(styles.inputArea)}>
        <textarea
          style=${styleMap(styles.textarea)}
          .value=${props.input}
          @input=${(event: Event) =>
            props.onInputChange((event.target as HTMLTextAreaElement).value)}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              props.onSend();
            }
          }}
          placeholder="Type a message..."
        ></textarea>
        <div style=${styleMap(styles.inputFooter)}>
          <div style="display: flex; align-items: center; gap: 8px;">
            <details style=${styleMap(styles.mediaMenu)}>
              <summary
                style=${styleMap({
                  ...styles.mediaMenuBtn,
                  ...(props.mediaSending || props.sending ? styles.sendBtnDisabled : {}),
                })}
              >
                ${props.mediaSending ? "Adding..." : "Add media"}
              </summary>
              <ul style=${styleMap(styles.mediaMenuList)}>
                <li>
                  <button
                    style=${styleMap(styles.mediaMenuItemBtn)}
                    ?disabled=${props.mediaSending || props.sending}
                    @click=${() => props.onScreenshot()}
                  >
                    Instant screenshot
                  </button>
                </li>
                <li>
                  <button
                    style=${styleMap(styles.mediaMenuItemBtn)}
                    ?disabled=${props.mediaSending || props.sending}
                    @click=${() => props.onUploadFromDevice()}
                  >
                    Upload from device
                  </button>
                </li>
              </ul>
            </details>
            <button
              style=${styleMap({
                ...styles.sendBtn,
                ...(props.sending || props.mediaSending ? styles.sendBtnDisabled : {}),
              })}
              ?disabled=${props.sending || props.mediaSending}
              @click=${props.onSend}
            >
              ${props.sending ? "Sending..." : "Send"}
            </button>
          </div>
          <span style=${styleMap(styles.refreshNote)}>Live sync every 2s</span>
        </div>
        ${props.error ? html`<div style=${styleMap(styles.error)}>${props.error}</div>` : nothing}
      </div>
    </section>
  `;
}
