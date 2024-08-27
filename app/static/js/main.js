document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const fileInputLabel = document.querySelector('.file-input-label');
    const uploadForm = document.getElementById('upload-form');
    const pdfLists = document.querySelectorAll('.pdf-list');
    const processBtns = document.querySelectorAll('.process-btn');

    // File input handling
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            document.getElementById('submit-btn').click();
        }
    });

    // Drag and drop for file upload
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadForm.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadForm.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadForm.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        uploadForm.classList.add('highlight');
    }

    function unhighlight(e) {
        uploadForm.classList.remove('highlight');
    }

    uploadForm.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        fileInput.files = files;
        document.getElementById('submit-btn').click();
    }

    // Drag and drop for PDF items
    pdfLists.forEach(list => {
        list.addEventListener('dragstart', dragStart);
        list.addEventListener('dragenter', dragEnter);
        list.addEventListener('dragover', dragOver);
        list.addEventListener('dragleave', dragLeave);
        list.addEventListener('drop', drop);
    });

    function dragStart(e) {
        e.dataTransfer.setData('text/plain', e.target.dataset.id);
        e.target.classList.add('dragging');
    }

    function dragEnter(e) {
        e.preventDefault();
        e.target.closest('.pdf-column').classList.add('drag-over');
    }

    function dragOver(e) {
        e.preventDefault();
    }

    function dragLeave(e) {
        e.target.closest('.pdf-column').classList.remove('drag-over');
    }

    function drop(e) {
        e.preventDefault();
        const id = e.dataTransfer.getData('text');
        const draggableElement = document.querySelector(`[data-id="${id}"]`);
        const dropzone = e.target.closest('.pdf-list');
        dropzone.appendChild(draggableElement);
        e.target.closest('.pdf-column').classList.remove('drag-over');
        draggableElement.classList.remove('dragging');
    
        // Update the PDF status
        const newStatus = dropzone.closest('.pdf-column').id === 'unprocessed-pdfs' ? 'Unprocessed' : 'Processed';
        updatePDFStatus(id, newStatus);
    
        // Update the process button visibility
        const processBtn = draggableElement.querySelector('.process-btn');
        if (newStatus === 'Processed' && processBtn) {
            processBtn.remove();
        } else if (newStatus === 'Unprocessed' && !processBtn) {
            const actionsDiv = draggableElement.querySelector('.pdf-actions');
            const newProcessBtn = document.createElement('button');
            newProcessBtn.className = 'action-btn process-btn';
            newProcessBtn.textContent = 'Process';
            newProcessBtn.addEventListener('click', processBtnClickHandler);
            actionsDiv.appendChild(newProcessBtn);
        }
    }

    function processBtnClickHandler(e) {
        const pdfItem = e.target.closest('.pdf-item');
        const id = pdfItem.dataset.id;
        updatePDFStatus(id, 'Processed');
        document.querySelector('#processed-pdfs .pdf-list').appendChild(pdfItem);
        e.target.remove();
    }

    // Process button handling
    document.querySelectorAll('.process-btn').forEach(btn => {
        btn.addEventListener('click', processBtnClickHandler);
    });

    // Function to update PDF status
    function updatePDFStatus(id, status) {
        fetch(`/api/pdfs/${id}/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: status }),
        })
        .then(response => response.json())
        .then(data => console.log('PDF status updated:', data))
        .catch(error => console.error('Error updating PDF status:', error));
    }

    // Function to delete PDF
    function deletePDF(id) {
        fetch(`/api/pdfs/${id}`, {
            method: 'DELETE',
        })
        .then(response => {
            if (response.ok) {
                const pdfItem = document.querySelector(`.pdf-item[data-id="${id}"]`);
                pdfItem.remove();
            } else {
                console.error('Error deleting PDF');
            }
        })
        .catch(error => console.error('Error:', error));
    }

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            deletePDF(id);
        });
    });

});