# FX-WSH-040 Runtime Entry Strong Intent

Verifies that Claude Runtime prompt routing treats a strong Work-start intent as a suggestion only.

The fixture must not run the Work-start Engine or create `.oh-my-ai/work-start` artifacts before explicit user invocation or approval.
