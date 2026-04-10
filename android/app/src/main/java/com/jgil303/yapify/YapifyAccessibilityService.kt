package com.jgil303.yapify

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ClipData
import android.content.ClipboardManager
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class YapifyAccessibilityService : AccessibilityService() {

    companion object {
        var instance: YapifyAccessibilityService? = null
        private var lastNode: AccessibilityNodeInfo? = null

        fun hasActiveField(): Boolean {
            val node = resolveEditableNode() ?: return false
            node.recycle()
            return true
        }

        fun injectText(text: String): Boolean {
            val node = resolveEditableNode() ?: return false
            return try {
                val currentText = node.text?.toString().orEmpty()
                val selectionStart = node.textSelectionStart.takeIf { it >= 0 } ?: currentText.length
                val selectionEnd = node.textSelectionEnd.takeIf { it >= 0 } ?: selectionStart
                val safeStart = minOf(selectionStart, selectionEnd).coerceIn(0, currentText.length)
                val safeEnd = maxOf(selectionStart, selectionEnd).coerceIn(safeStart, currentText.length)
                val mergedText = buildString {
                    append(currentText.substring(0, safeStart))
                    append(text)
                    append(currentText.substring(safeEnd))
                }
                val replaceArgs = Bundle().apply {
                    putCharSequence(
                        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                        mergedText
                    )
                }

                if (node.isEditable && node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, replaceArgs)) {
                    val newCursor = safeStart + text.length
                    val selectionArgs = Bundle().apply {
                        putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, newCursor)
                        putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, newCursor)
                    }
                    node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, selectionArgs)
                    true
                } else {
                    node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                    node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    val clipboard = instance?.getSystemService(CLIPBOARD_SERVICE) as? ClipboardManager
                        ?: return false
                    clipboard.setPrimaryClip(ClipData.newPlainText("yapi", text))
                    node.performAction(AccessibilityNodeInfo.ACTION_PASTE)
                }
            } catch (e: Exception) {
                false
            } finally {
                node.recycle()
            }
        }

        private fun resolveEditableNode(): AccessibilityNodeInfo? {
            instance?.rootInActiveWindow?.let { root ->
                findFocusedEditableNode(root)?.let { found ->
                    replaceLastNode(found)
                    found.recycle()
                }
                findEditableNode(root)?.let { found ->
                    replaceLastNode(found)
                    found.recycle()
                }
            }
            return lastNode?.let(AccessibilityNodeInfo::obtain)
        }

        private fun replaceLastNode(node: AccessibilityNodeInfo) {
            lastNode?.recycle()
            lastNode = AccessibilityNodeInfo.obtain(node)
        }

        private fun findFocusedEditableNode(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
            if (node == null) return null
            if (node.isEditable && node.isFocused) return AccessibilityNodeInfo.obtain(node)
            for (index in 0 until node.childCount) {
                val match = findFocusedEditableNode(node.getChild(index))
                if (match != null) return match
            }
            return null
        }

        private fun findEditableNode(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
            if (node == null) return null
            if (node.isEditable || node.isFocused) return AccessibilityNodeInfo.obtain(node)
            for (index in 0 until node.childCount) {
                val match = findEditableNode(node.getChild(index))
                if (match != null) return match
            }
            return null
        }
    }

    override fun onServiceConnected() {
        instance = this
        serviceInfo = serviceInfo.apply {
            eventTypes =
                AccessibilityEvent.TYPE_VIEW_FOCUSED or
                AccessibilityEvent.TYPE_VIEW_CLICKED or
                AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED or
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or
                AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags =
                AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
                AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
            notificationTimeout = 100
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        val source = event.source ?: return
        if (event.packageName?.toString() == packageName) return
        if (source.isEditable || source.isFocused) {
            replaceLastNode(source)
        }
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        instance = null
        lastNode?.recycle()
        lastNode = null
        super.onDestroy()
    }
}
